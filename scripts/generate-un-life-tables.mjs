#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { pathToFileURL } from "node:url";

const REQUIRED_COLUMNS = [
  "LocID",
  "ISO3_code",
  "ISO2_code",
  "LocTypeName",
  "Location",
  "Variant",
  "Time",
  "Sex",
  "AgeGrp",
  "AgeGrpStart",
  "ex",
];

const SOURCE_FILES = {
  male: "WPP2024_Life_Table_Complete_Medium_Male_1950-2023.csv.gz",
  female: "WPP2024_Life_Table_Complete_Medium_Female_1950-2023.csv.gz",
  both: "WPP2024_Life_Table_Complete_Medium_Both_1950-2023.csv.gz",
};

const EXPECTED_SEX = { male: "Male", female: "Female", both: "Total" };

function parseCsvLine(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field");
  fields.push(field);
  return fields;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith("--") || argv[i + 1] == null) {
      throw new Error(`Expected --name value, received ${flag || "nothing"}`);
    }
    args[flag.slice(2)] = argv[i + 1];
  }
  for (const name of ["male", "female", "both", "output", "extraction-date"]) {
    if (!args[name]) throw new Error(`Missing required --${name}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args["extraction-date"])) {
    throw new Error("--extraction-date must be YYYY-MM-DD");
  }
  return args;
}

async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function readSource(path, kind) {
  const rows = new Map();
  const input = createReadStream(path).pipe(createGunzip());
  const lines = createInterface({ input, crlfDelay: Infinity });
  let indexes;
  let lineNumber = 0;

  for await (const rawLine of lines) {
    lineNumber += 1;
    const line = lineNumber === 1 ? rawLine.replace(/^\uFEFF/, "") : rawLine;
    const fields = parseCsvLine(line);
    if (!indexes) {
      indexes = Object.fromEntries(fields.map((name, index) => [name, index]));
      for (const column of REQUIRED_COLUMNS) {
        if (!(column in indexes)) {
          throw new Error(`${basename(path)} is missing ${column}`);
        }
      }
      continue;
    }

    const value = (column) => fields[indexes[column]];
    if (
      value("LocTypeName") !== "Country/Area" ||
      value("Variant") !== "Medium" ||
      value("Time") !== "2023"
    ) {
      continue;
    }
    if (value("Sex") !== EXPECTED_SEX[kind]) {
      throw new Error(
        `${basename(path)}:${lineNumber} expected ${EXPECTED_SEX[kind]}, got ${value("Sex")}`,
      );
    }

    const locId = Number(value("LocID"));
    const age = Number(value("AgeGrpStart"));
    const expectancy = Number(value("ex"));
    if (
      !Number.isInteger(locId) ||
      !Number.isInteger(age) ||
      !Number.isFinite(expectancy) ||
      expectancy < 0
    ) {
      throw new Error(
        `${basename(path)}:${lineNumber} has invalid numeric data`,
      );
    }
    if (age === 100 && value("AgeGrp") !== "100+") {
      throw new Error(
        `${basename(path)}:${lineNumber} must label the terminal age 100+`,
      );
    }

    let location = rows.get(locId);
    if (!location) {
      location = {
        locId,
        name: value("Location"),
        iso2: value("ISO2_code") || null,
        iso3: value("ISO3_code") || null,
        ages: new Map(),
      };
      rows.set(locId, location);
    }
    if (
      location.name !== value("Location") ||
      location.iso2 !== (value("ISO2_code") || null) ||
      location.iso3 !== (value("ISO3_code") || null)
    ) {
      throw new Error(
        `${basename(path)}:${lineNumber} has inconsistent metadata`,
      );
    }
    if (location.ages.has(age)) {
      throw new Error(`${basename(path)}:${lineNumber} duplicates age ${age}`);
    }
    location.ages.set(age, expectancy);
  }

  if (!indexes) throw new Error(`${basename(path)} is empty`);
  return rows;
}

function orderedSeries(location, kind) {
  const ages = [...location.ages.keys()].sort((a, b) => a - b);
  if (ages.length !== 101 || ages.some((age, index) => age !== index)) {
    throw new Error(
      `${location.name} (${kind}) must cover ages 0..99 and 100+, got ${ages.join(",")}`,
    );
  }
  return ages.map((age) => location.ages.get(age));
}

export function encodeSeries(values) {
  const bytes = Buffer.allocUnsafe(values.length * 2);
  let maxError = 0;
  values.forEach((value, index) => {
    const quantized = Math.round(value * 100);
    if (quantized < 0 || quantized > 65535) {
      throw new Error(
        `Value ${value} cannot be encoded as hundredths in uint16`,
      );
    }
    bytes.writeUInt16LE(quantized, index * 2);
    maxError = Math.max(maxError, Math.abs(value - quantized / 100));
  });
  return { encoded: bytes.toString("base64"), maxError };
}

function mergeSources(sources) {
  const ids = [...sources.male.keys()].sort((a, b) => a - b);
  for (const kind of ["female", "both"]) {
    const otherIds = [...sources[kind].keys()].sort((a, b) => a - b);
    if (ids.join(",") !== otherIds.join(",")) {
      throw new Error(`Location IDs differ between male and ${kind} sources`);
    }
  }

  let maxQuantizationError = 0;
  const locations = ids.map((locId) => {
    const base = sources.male.get(locId);
    const series = {};
    for (const [kind, runtimeSex] of [
      ["male", "male"],
      ["female", "female"],
      ["both", "unisex"],
    ]) {
      const location = sources[kind].get(locId);
      if (
        location.name !== base.name ||
        location.iso2 !== base.iso2 ||
        location.iso3 !== base.iso3
      ) {
        throw new Error(`${base.name} metadata differs in ${kind} source`);
      }
      const packed = encodeSeries(orderedSeries(location, kind));
      series[runtimeSex] = packed.encoded;
      maxQuantizationError = Math.max(maxQuantizationError, packed.maxError);
    }
    return {
      id: `un:${locId}`,
      locId,
      m49: String(locId).padStart(3, "0"),
      name: base.name,
      iso2: base.iso2,
      iso3: base.iso3,
      series,
    };
  });
  return { locations, maxQuantizationError };
}

function renderModule({ locations, maxQuantizationError, metadata }) {
  const records = locations
    .map(
      ({ id, locId, m49, name, iso2, iso3, series }) =>
        `  { id: ${JSON.stringify(id)}, locId: ${locId}, m49: ${JSON.stringify(m49)}, name: ${JSON.stringify(name)}, iso2: ${JSON.stringify(iso2)}, iso3: ${JSON.stringify(iso3)}, series: { male: ${JSON.stringify(series.male)}, female: ${JSON.stringify(series.female)}, unisex: ${JSON.stringify(series.unisex)} } },`,
    )
    .join("\n");
  return `// GENERATED FILE — DO NOT EDIT.
// Source: UN World Population Prospects 2024 complete life tables.
// Filters: Variant=Medium, Time=2023, LocTypeName=Country/Area.
// Columns: LocID, ISO2_code, ISO3_code, Location, Sex, AgeGrpStart, ex.
// Encoding: e(x) rounded to hundredths, unsigned 16-bit little-endian, Base64.
// Regenerate with scripts/generate-un-life-tables.mjs; see THIRD_PARTY_NOTICES.txt.

export const UN_LIFE_TABLE_AGE_COUNT = 101;
export const UN_LIFE_TABLE_SOURCE = Object.freeze(${JSON.stringify(
    {
      ...metadata,
      locationCount: locations.length,
      maxQuantizationError: Number(maxQuantizationError.toFixed(12)),
    },
    null,
    2,
  )});

export const UN_LIFE_TABLES = Object.freeze([
${records}
]);
`;
}

export async function generate({ male, female, both, output, extractionDate }) {
  const paths = {
    male: resolve(male),
    female: resolve(female),
    both: resolve(both),
  };
  const [maleRows, femaleRows, bothRows, maleHash, femaleHash, bothHash] =
    await Promise.all([
      readSource(paths.male, "male"),
      readSource(paths.female, "female"),
      readSource(paths.both, "both"),
      checksum(paths.male),
      checksum(paths.female),
      checksum(paths.both),
    ]);
  const merged = mergeSources({
    male: maleRows,
    female: femaleRows,
    both: bothRows,
  });
  const text = renderModule({
    ...merged,
    metadata: {
      publication: "World Population Prospects 2024",
      extractionDate,
      filters: {
        variant: "Medium",
        year: 2023,
        locationType: "Country/Area",
      },
      sourceFiles: {
        male: { name: SOURCE_FILES.male, sha256: maleHash },
        female: { name: SOURCE_FILES.female, sha256: femaleHash },
        both: { name: SOURCE_FILES.both, sha256: bothHash },
      },
      quantization: "hundredths of a year",
      encoding: "uint16le-base64",
    },
  });
  const outputPath = resolve(output);
  await fs.mkdir(dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, text);
  return {
    locationCount: merged.locations.length,
    maxQuantizationError: merged.maxQuantizationError,
    bytes: Buffer.byteLength(text),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await generate({
      male: args.male,
      female: args.female,
      both: args.both,
      output: args.output,
      extractionDate: args["extraction-date"],
    });
    console.log(
      `Generated ${result.locationCount} locations (${result.bytes} bytes, max error ${result.maxQuantizationError.toFixed(6)} years)`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
