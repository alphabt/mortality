import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIFE_TABLE,
  FEMALE,
  LIFE_TABLE_OPTIONS,
  MALE,
  UNISEX,
  WORLD_BOTH,
  WORLD_FEMALE,
  WORLD_MALE,
  WORLD_UNISEX,
  estimateExpectancy,
  normalizeLifeTable,
} from "../src/lifetable.js";

const US_AGES = Array.from({ length: 120 }, (_, age) => age);
const WORLD_AGES = Array.from({ length: 101 }, (_, age) => age);

function expectTotalAgeToRise(table) {
  for (let age = 1; age < table.length; age++) {
    expect(age + table[age]).toBeGreaterThanOrEqual(age - 1 + table[age - 1]);
  }
}

describe("life table data", () => {
  it("covers SSA integer ages 0..119", () => {
    expect(MALE.length).toBe(120);
    expect(FEMALE.length).toBe(120);
    expect(UNISEX.length).toBe(120);
  });

  it("matches SSA Period Life Table 2023 spot values", () => {
    expect(MALE[0]).toBeCloseTo(75.79, 2);
    expect(MALE[65]).toBeCloseTo(18.12, 2);
    expect(MALE[100]).toBeCloseTo(2.04, 2);
    expect(FEMALE[0]).toBeCloseTo(81.06, 2);
    expect(FEMALE[65]).toBeCloseTo(20.66, 2);
    expect(FEMALE[100]).toBeCloseTo(2.23, 2);
  });

  it("covers UN World ages 0..99 plus the 100+ endpoint", () => {
    expect(WORLD_MALE.length).toBe(101);
    expect(WORLD_FEMALE.length).toBe(101);
    expect(WORLD_BOTH.length).toBe(101);
    expect(WORLD_UNISEX.length).toBe(101);
  });

  it("matches UN WPP 2024 World 2023 spot values", () => {
    expect(WORLD_MALE[0]).toBeCloseTo(70.5472, 4);
    expect(WORLD_MALE[65]).toBeCloseTo(16.0083, 4);
    expect(WORLD_MALE[100]).toBeCloseTo(2.0733, 4);
    expect(WORLD_FEMALE[0]).toBeCloseTo(75.8857, 4);
    expect(WORLD_FEMALE[65]).toBeCloseTo(18.9811, 4);
    expect(WORLD_FEMALE[100]).toBeCloseTo(2.269, 4);
    expect(WORLD_BOTH[0]).toBeCloseTo(73.1694, 4);
    expect(WORLD_BOTH[65]).toBeCloseTo(17.5661, 4);
    expect(WORLD_BOTH[100]).toBeCloseTo(2.2298, 4);
  });

  it("derives the SSA unisex table as the simple male/female average", () => {
    for (const age of US_AGES) {
      expect(UNISEX[age]).toBeCloseTo((MALE[age] + FEMALE[age]) / 2, 10);
    }
  });

  it("uses the official UN both-sexes series for the World unisex table", () => {
    for (const age of WORLD_AGES) {
      expect(WORLD_UNISEX[age]).toBe(WORLD_BOTH[age]);
      expect(WORLD_UNISEX[age]).toBeGreaterThanOrEqual(WORLD_MALE[age]);
      expect(WORLD_UNISEX[age]).toBeLessThanOrEqual(WORLD_FEMALE[age]);
    }
  });

  it("keeps total expected age non-decreasing in every table", () => {
    for (const table of [
      MALE,
      FEMALE,
      UNISEX,
      WORLD_MALE,
      WORLD_FEMALE,
      WORLD_BOTH,
      WORLD_UNISEX,
    ]) {
      expectTotalAgeToRise(table);
    }
  });

  it("keeps female e(x) at or above male e(x) in each baseline", () => {
    for (const age of US_AGES) {
      expect(FEMALE[age]).toBeGreaterThanOrEqual(MALE[age]);
    }
    for (const age of WORLD_AGES) {
      expect(WORLD_FEMALE[age]).toBeGreaterThanOrEqual(WORLD_MALE[age]);
    }
  });
});

describe("life-table baseline metadata", () => {
  it("defaults to World and exposes explicit World and U.S. choices", () => {
    expect(DEFAULT_LIFE_TABLE).toBe("world");
    expect(LIFE_TABLE_OPTIONS.map(({ value }) => value)).toEqual([
      "world",
      "us",
    ]);
    expect(LIFE_TABLE_OPTIONS.map(({ messageKey }) => messageKey)).toEqual([
      "lifeTableWorld",
      "lifeTableUS",
    ]);
  });

  it("normalizes unknown values to World", () => {
    expect(normalizeLifeTable("world")).toBe("world");
    expect(normalizeLifeTable("us")).toBe("us");
    expect(normalizeLifeTable("un:392")).toBe("un:392");
    expect(normalizeLifeTable("unknown")).toBe("world");
    expect(normalizeLifeTable(null)).toBe("world");
  });
});

describe("estimateExpectancy", () => {
  it("uses the World baseline by default", () => {
    expect(estimateExpectancy(0, "male")).toBe(
      estimateExpectancy(0, "male", "world"),
    );
    expect(estimateExpectancy(0, "male")).toBe(71);
    expect(estimateExpectancy(0, "female")).toBe(76);
  });

  it("can select the U.S. SSA baseline explicitly", () => {
    expect(estimateExpectancy(0, "male", "us")).toBe(76);
    expect(estimateExpectancy(0, "female", "us")).toBe(81);
    expect(estimateExpectancy(65, "male", "us")).toBe(83);
  });

  it("can select a generated UN country or area explicitly", () => {
    expect(estimateExpectancy(0, "male", "un:392")).toBe(82);
    expect(estimateExpectancy(0, "male", "un:566")).toBe(54);
    expect(estimateExpectancy(65, "female", "un:276")).toBe(86);
  });

  it("falls back to World for an unknown baseline", () => {
    expect(estimateExpectancy(40, null, "unknown")).toBe(
      estimateExpectancy(40, null, "world"),
    );
  });

  it("always returns a whole number", () => {
    for (const age of [0, 12.4, 40, 65.5, 90, 119]) {
      for (const sex of ["male", "female", null]) {
        for (const lifeTable of ["world", "us", "un:392"]) {
          expect(
            Number.isInteger(estimateExpectancy(age, sex, lifeTable)),
          ).toBe(true);
        }
      }
    }
  });

  it("never returns less than the attained age inside the app range", () => {
    for (const age of [0, 40.5, 100, 119, 149]) {
      for (const lifeTable of ["world", "us", "un:392"]) {
        expect(
          estimateExpectancy(age, "male", lifeTable),
        ).toBeGreaterThanOrEqual(Math.ceil(age));
      }
    }
  });

  it("has a total expected age that rises with attained age", () => {
    for (const lifeTable of ["world", "us", "un:392"]) {
      for (const sex of ["male", "female", null]) {
        for (let age = 1; age < 120; age++) {
          expect(
            estimateExpectancy(age, sex, lifeTable),
          ).toBeGreaterThanOrEqual(estimateExpectancy(age - 1, sex, lifeTable));
        }
      }
    }
  });

  it("conditions on survival instead of keeping the at-birth figure flat", () => {
    for (const lifeTable of ["world", "us", "un:392"]) {
      expect(estimateExpectancy(70, "male", lifeTable)).toBeGreaterThan(
        estimateExpectancy(0, "male", lifeTable),
      );
    }
  });

  it("orders the sexes: female >= unisex >= male", () => {
    for (const lifeTable of ["world", "us", "un:392"]) {
      for (const age of [0, 25, 50, 70, 90]) {
        const male = estimateExpectancy(age, "male", lifeTable);
        const female = estimateExpectancy(age, "female", lifeTable);
        const unisex = estimateExpectancy(age, null, lifeTable);
        expect(female).toBeGreaterThanOrEqual(unisex);
        expect(unisex).toBeGreaterThanOrEqual(male);
      }
    }
  });

  it("treats an unknown sex as unisex", () => {
    expect(estimateExpectancy(40, undefined)).toBe(
      estimateExpectancy(40, null),
    );
    expect(estimateExpectancy(40, "other")).toBe(estimateExpectancy(40, null));
  });

  it("interpolates e(x) smoothly between integer ages", () => {
    for (const lifeTable of ["world", "us", "un:392"]) {
      const lo = estimateExpectancy(40, "male", lifeTable);
      const hi = estimateExpectancy(41, "male", lifeTable);
      const mid = estimateExpectancy(40.5, "male", lifeTable);
      expect(mid).toBeGreaterThanOrEqual(Math.min(lo, hi));
      expect(mid).toBeLessThanOrEqual(Math.max(lo, hi));
    }
  });

  it("clamps table lookup at each source's endpoint without going below age", () => {
    expect(estimateExpectancy(-10, "male", "world")).toBe(
      estimateExpectancy(0, "male", "world"),
    );
    expect(estimateExpectancy(105, "male", "world")).toBeGreaterThanOrEqual(
      105,
    );
    expect(estimateExpectancy(125, "male", "us")).toBeGreaterThanOrEqual(125);
  });

  it("keeps the result inside the app's [1, 150] band", () => {
    for (const age of [-100, 0, 60, 119, 1000]) {
      for (const lifeTable of ["world", "us"]) {
        const value = estimateExpectancy(age, "female", lifeTable);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(150);
      }
    }
  });

  it("falls back to a sane figure for non-finite ages", () => {
    expect(estimateExpectancy(NaN, null)).toBe(estimateExpectancy(0, null));
    expect(estimateExpectancy(Infinity, "male")).toBeLessThanOrEqual(150);
  });
});
