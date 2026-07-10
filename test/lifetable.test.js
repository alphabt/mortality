import { describe, it, expect } from "vitest";
import { MALE, FEMALE, UNISEX, estimateExpectancy } from "../src/lifetable.js";

const AGES = Array.from({ length: 120 }, (_, x) => x);

describe("life table data", () => {
  it("covers integer ages 0..119 for both sexes", () => {
    expect(MALE.length).toBe(120);
    expect(FEMALE.length).toBe(120);
    expect(UNISEX.length).toBe(120);
  });

  it("matches the SSA source spot values (Period Life Table, 2023)", () => {
    expect(MALE[0]).toBeCloseTo(75.79, 2);
    expect(MALE[65]).toBeCloseTo(18.12, 2);
    expect(MALE[100]).toBeCloseTo(2.04, 2);
    expect(FEMALE[0]).toBeCloseTo(81.06, 2);
    expect(FEMALE[65]).toBeCloseTo(20.66, 2);
    expect(FEMALE[100]).toBeCloseTo(2.23, 2);
  });

  it("derives UNISEX as the simple average of MALE and FEMALE", () => {
    for (const x of AGES) {
      expect(UNISEX[x]).toBeCloseTo((MALE[x] + FEMALE[x]) / 2, 10);
    }
  });

  it("has a non-increasing e(x) with age (remaining life shrinks)", () => {
    for (const table of [MALE, FEMALE, UNISEX]) {
      for (let x = 1; x < table.length; x++) {
        expect(table[x]).toBeLessThanOrEqual(table[x - 1] + 1e-9);
      }
    }
  });

  it("keeps female e(x) at or above male e(x) at every age", () => {
    for (const x of AGES) {
      expect(FEMALE[x]).toBeGreaterThanOrEqual(MALE[x]);
    }
  });
});

describe("estimateExpectancy", () => {
  it("returns a plausible at-birth expectancy for each sex", () => {
    // Recent SSA period tables: e(0) male ~73-76, female ~79-82.
    expect(estimateExpectancy(0, "male")).toBeGreaterThanOrEqual(73);
    expect(estimateExpectancy(0, "male")).toBeLessThanOrEqual(76);
    expect(estimateExpectancy(0, "female")).toBeGreaterThanOrEqual(79);
    expect(estimateExpectancy(0, "female")).toBeLessThanOrEqual(82);
  });

  it("always returns a whole number", () => {
    for (const x of [0, 12.4, 40, 65.5, 90, 119]) {
      for (const sex of ["male", "female", null]) {
        expect(Number.isInteger(estimateExpectancy(x, sex))).toBe(true);
      }
    }
  });

  it("never returns less than the attained age", () => {
    for (const x of AGES) {
      expect(estimateExpectancy(x, "male")).toBeGreaterThanOrEqual(x);
      expect(estimateExpectancy(x, "female")).toBeGreaterThanOrEqual(x);
      expect(estimateExpectancy(x, null)).toBeGreaterThanOrEqual(x);
    }
  });

  it("has a total expected age that rises with attained age", () => {
    for (const sex of ["male", "female", null]) {
      for (let x = 1; x < 120; x++) {
        expect(estimateExpectancy(x, sex)).toBeGreaterThanOrEqual(
          estimateExpectancy(x - 1, sex),
        );
      }
    }
  });

  it("estimates a higher total for older users than the flat at-birth figure", () => {
    // Conditioning on survival: a 70-year-old outlives the at-birth average.
    expect(estimateExpectancy(70, "male")).toBeGreaterThan(
      estimateExpectancy(0, "male"),
    );
  });

  it("orders the sexes: female >= unisex >= male at a given age", () => {
    for (const x of [0, 25, 50, 70, 90]) {
      const male = estimateExpectancy(x, "male");
      const female = estimateExpectancy(x, "female");
      const unisex = estimateExpectancy(x, null);
      expect(female).toBeGreaterThanOrEqual(unisex);
      expect(unisex).toBeGreaterThanOrEqual(male);
    }
  });

  it("treats an unknown sex as unisex", () => {
    expect(estimateExpectancy(40, undefined)).toBe(
      estimateExpectancy(40, null),
    );
    expect(estimateExpectancy(40, "other")).toBe(estimateExpectancy(40, null));
  });

  it("interpolates e(x) smoothly between integer ages", () => {
    // The half-year point sits between the two bracketing integer totals.
    const lo = estimateExpectancy(40, "male");
    const hi = estimateExpectancy(41, "male");
    const mid = estimateExpectancy(40.5, "male");
    expect(mid).toBeGreaterThanOrEqual(Math.min(lo, hi));
    expect(mid).toBeLessThanOrEqual(Math.max(lo, hi));
  });

  it("clamps the attained age to the table bounds", () => {
    // Below 0 and above the last index resolve to the endpoint estimates.
    expect(estimateExpectancy(-10, "male")).toBe(estimateExpectancy(0, "male"));
    expect(estimateExpectancy(500, "male")).toBe(
      estimateExpectancy(119, "male"),
    );
  });

  it("keeps the result inside the app's [1, 150] band", () => {
    for (const x of [-100, 0, 60, 119, 1000]) {
      const value = estimateExpectancy(x, "female");
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(150);
    }
  });

  it("falls back to a sane figure for non-finite ages", () => {
    expect(estimateExpectancy(NaN, null)).toBe(estimateExpectancy(0, null));
    expect(estimateExpectancy(Infinity, "male")).toBeLessThanOrEqual(150);
  });
});
