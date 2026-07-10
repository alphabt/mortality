import { stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const modulePath = new URL("../src/un-life-tables.js", import.meta.url);
const generatedPath = new URL("../src/data/un-life-tables.js", import.meta.url);
// Keep module parse and first selected-series decode as separate measurements.
const importStart = performance.now();
const { UN_LOCATIONS, decodeUnLifeTable } = await import(modulePath);
const importMs = performance.now() - importStart;
const sample = UN_LOCATIONS[Math.floor(UN_LOCATIONS.length / 2)];
const decodeStart = performance.now();
decodeUnLifeTable(sample.id, null);
const decodeMs = performance.now() - decodeStart;
const { size } = await stat(generatedPath);

console.log(
  JSON.stringify(
    {
      generatedBytes: size,
      locations: UN_LOCATIONS.length,
      moduleImportMs: Number(importMs.toFixed(3)),
      selectedSeriesDecodeMs: Number(decodeMs.toFixed(3)),
    },
    null,
    2,
  ),
);
