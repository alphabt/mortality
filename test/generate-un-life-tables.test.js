import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { encodeSeries, generate } from "../scripts/generate-un-life-tables.mjs";

const temporaryDirectories = [];
const header =
  "LocID,ISO3_code,ISO2_code,LocTypeName,Location,Variant,Time,Sex,AgeGrp,AgeGrpStart,ex";

function sourceRows(sex) {
  const rows = [header];
  for (const location of [
    { id: 8, iso3: "ALB", iso2: "AL", name: "Albania" },
    { id: 344, iso3: "HKG", iso2: "HK", name: "China, Hong Kong SAR" },
  ]) {
    for (let age = 0; age <= 100; age += 1) {
      const name = location.name.includes(",")
        ? `"${location.name}"`
        : location.name;
      rows.push(
        [
          location.id,
          location.iso3,
          location.iso2,
          "Country/Area",
          name,
          "Medium",
          2023,
          sex,
          age === 100 ? "100+" : age,
          age,
          (80 - age * 0.7 + (sex === "Female" ? 2 : 0)).toFixed(4),
        ].join(","),
      );
    }
  }
  rows.push("900,WRL,,World,World,Medium,2023,Total,0,0,73.1694");
  rows.push("8,ALB,AL,Country/Area,Albania,Medium,2022,Total,0,0,79");
  return `${rows.join("\n")}\n`;
}

async function fixture() {
  const dir = await fs.mkdtemp(join(tmpdir(), "mortality-un-"));
  temporaryDirectories.push(dir);
  const paths = {};
  for (const [kind, sex] of [
    ["male", "Male"],
    ["female", "Female"],
    ["both", "Total"],
  ]) {
    paths[kind] = join(dir, `${kind}.csv.gz`);
    await fs.writeFile(paths[kind], gzipSync(sourceRows(sex)));
  }
  return { dir, paths };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => fs.rm(path, { recursive: true, force: true })),
  );
});

describe("UN life-table generator", () => {
  it("quantizes transparent uint16 series with bounded error", () => {
    const { encoded, maxError } = encodeSeries([81.6934, 24.8549, 2.3749]);
    const bytes = Buffer.from(encoded, "base64");
    expect(
      [...Array(3).keys()].map((index) => bytes.readUInt16LE(index * 2)),
    ).toEqual([8169, 2485, 237]);
    expect(maxError).toBeLessThanOrEqual(0.005);
  });

  it("filters, orders, quotes, and emits deterministic generated output", async () => {
    const { dir, paths } = await fixture();
    const first = join(dir, "first.js");
    const second = join(dir, "second.js");
    const options = {
      ...paths,
      extractionDate: "2026-07-10",
    };
    const result = await generate({ ...options, output: first });
    await generate({ ...options, output: second });
    const [firstText, secondText] = await Promise.all([
      fs.readFile(first, "utf8"),
      fs.readFile(second, "utf8"),
    ]);
    expect(result.locationCount).toBe(2);
    expect(firstText).toBe(secondText);
    expect(firstText.indexOf('id: "un:8"')).toBeLessThan(
      firstText.indexOf('id: "un:344"'),
    );
    expect(firstText).toContain('name: "China, Hong Kong SAR"');
    expect(firstText).not.toContain('id: "un:900"');
    expect(firstText).toContain('"locationType": "Country/Area"');
  });
});
