import {
  UN_LIFE_TABLE_AGE_COUNT,
  UN_LIFE_TABLE_SOURCE,
  UN_LIFE_TABLES,
} from "./data/un-life-tables.js";

export { UN_LIFE_TABLE_AGE_COUNT, UN_LIFE_TABLE_SOURCE };

const recordsById = new Map(
  UN_LIFE_TABLES.map((record) => [record.id, record]),
);
const decodedSeries = new Map();

export const UN_LOCATIONS = Object.freeze(
  UN_LIFE_TABLES.map(({ series: _series, ...metadata }) =>
    Object.freeze(metadata),
  ),
);

export function isUnLifeTable(value) {
  return typeof value === "string" && recordsById.has(value);
}

function decodeBase64(value) {
  if (typeof globalThis.atob === "function") return globalThis.atob(value);
  if (typeof globalThis.Buffer?.from === "function") {
    return globalThis.Buffer.from(value, "base64").toString("latin1");
  }
  throw new Error("Base64 decoding is unavailable");
}

export function decodeUnLifeTable(value, sex) {
  const record = recordsById.get(value);
  if (!record) return null;
  const seriesName = sex === "male" || sex === "female" ? sex : "unisex";
  const cacheKey = `${value}:${seriesName}`;
  if (decodedSeries.has(cacheKey)) return decodedSeries.get(cacheKey);

  const binary = decodeBase64(record.series[seriesName]);
  if (binary.length !== UN_LIFE_TABLE_AGE_COUNT * 2) {
    throw new Error(`Invalid encoded life table for ${cacheKey}`);
  }
  const decoded = new Array(UN_LIFE_TABLE_AGE_COUNT);
  for (let index = 0; index < decoded.length; index += 1) {
    const offset = index * 2;
    decoded[index] =
      (binary.charCodeAt(offset) | (binary.charCodeAt(offset + 1) << 8)) / 100;
  }
  Object.freeze(decoded);
  decodedSeries.set(cacheKey, decoded);
  return decoded;
}
