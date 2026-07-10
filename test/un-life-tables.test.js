import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  UN_LIFE_TABLE_AGE_COUNT,
  UN_LIFE_TABLE_SOURCE,
  UN_LOCATIONS,
  decodeUnLifeTable,
  isUnLifeTable,
} from "../src/un-life-tables.js";

function location(iso3) {
  return UN_LOCATIONS.find((record) => record.iso3 === iso3);
}

describe("generated UN country and area life tables", () => {
  it("contains all 237 official 2023 Medium Country/Area records", () => {
    expect(UN_LIFE_TABLE_SOURCE.locationCount).toBe(237);
    expect(UN_LOCATIONS).toHaveLength(237);
    expect(UN_LIFE_TABLE_SOURCE.filters).toEqual({
      variant: "Medium",
      year: 2023,
      locationType: "Country/Area",
    });
  });

  it("uses unique stable IDs and codes in deterministic LocID order", () => {
    const ids = UN_LOCATIONS.map(({ id }) => id);
    const locIds = UN_LOCATIONS.map(({ locId }) => locId);
    const iso2 = UN_LOCATIONS.map(({ iso2: code }) => code);
    const iso3 = UN_LOCATIONS.map(({ iso3: code }) => code);
    expect(new Set(ids).size).toBe(237);
    expect(new Set(locIds).size).toBe(237);
    expect(new Set(iso2).size).toBe(237);
    expect(new Set(iso3).size).toBe(237);
    expect(locIds).toEqual([...locIds].sort((a, b) => a - b));
    for (const record of UN_LOCATIONS) {
      expect(record.id).toBe(`un:${record.locId}`);
      expect(record.m49).toBe(String(record.locId).padStart(3, "0"));
      expect(record.iso2).toMatch(/^[A-Z]{2}$/);
      expect(record.iso3).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("uses the Node Buffer fallback when atob is unavailable", () => {
    const nativeAtob = globalThis.atob;
    vi.stubGlobal("atob", undefined);
    try {
      expect(decodeUnLifeTable("un:4", "male")).toHaveLength(101);
    } finally {
      vi.stubGlobal("atob", nativeAtob);
    }
  });

  it("decodes every sex series to 101 finite non-negative values", () => {
    expect(UN_LIFE_TABLE_AGE_COUNT).toBe(101);
    for (const record of UN_LOCATIONS) {
      for (const sex of ["male", "female", null]) {
        const series = decodeUnLifeTable(record.id, sex);
        expect(series, `${record.id}:${sex}`).toHaveLength(101);
        expect(
          series.every((value) => Number.isFinite(value) && value >= 0),
          `${record.id}:${sex}`,
        ).toBe(true);
      }
    }
  });

  it("keeps total expected age non-decreasing in every generated series", () => {
    for (const record of UN_LOCATIONS) {
      for (const sex of ["male", "female", null]) {
        const series = decodeUnLifeTable(record.id, sex);
        for (let age = 1; age < series.length; age += 1) {
          expect(
            age + series[age],
            `${record.id}:${sex}:${age}`,
          ).toBeGreaterThanOrEqual(age - 1 + series[age - 1] - 0.011);
        }
      }
    }
  });

  it("memoizes only requested decoded series", () => {
    const first = decodeUnLifeTable("un:392", "male");
    expect(decodeUnLifeTable("un:392", "male")).toBe(first);
    expect(decodeUnLifeTable("un:392", "female")).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("matches representative source values across regions, ages, and sexes", () => {
    expect(decodeUnLifeTable(location("JPN").id, "male")[0]).toBeCloseTo(
      81.69,
      2,
    );
    expect(decodeUnLifeTable(location("NGA").id, "female")[65]).toBeCloseTo(
      12.28,
      2,
    );
    expect(decodeUnLifeTable(location("BRA").id, null)[100]).toBeCloseTo(
      1.81,
      2,
    );
    expect(decodeUnLifeTable(location("HKG").id, "male")[0]).toBeCloseTo(
      82.84,
      2,
    );
  });

  it("keeps selected countries meaningfully distinct from the World series", async () => {
    const { WORLD_MALE } = await import("../src/lifetable.js");
    expect(decodeUnLifeTable("un:392", "male")[0]).not.toBeCloseTo(
      WORLD_MALE[0],
      1,
    );
    expect(decodeUnLifeTable("un:566", "male")[0]).not.toBeCloseTo(
      WORLD_MALE[0],
      1,
    );
  });

  it("reports source checksums and at most half-a-hundredth error", () => {
    expect(UN_LIFE_TABLE_SOURCE.maxQuantizationError).toBeLessThanOrEqual(
      0.005,
    );
    for (const source of Object.values(UN_LIFE_TABLE_SOURCE.sourceFiles)) {
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("keeps the generated module under the 250 KB parse budget", () => {
    const bytes = readFileSync(
      resolve(process.cwd(), "src/data/un-life-tables.js"),
    ).byteLength;
    expect(bytes).toBeLessThan(250_000);
  });

  it("rejects unknown keys without decoding", () => {
    expect(isUnLifeTable("un:392")).toBe(true);
    expect(isUnLifeTable("un:9999")).toBe(false);
    expect(decodeUnLifeTable("un:9999", "male")).toBeNull();
  });
});
