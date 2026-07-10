import { describe, expect, it } from "vitest";
import { lifeGridRows } from "../src/life-grid.js";

describe("lifeGridRows", () => {
  it("returns no rows for an empty grid", () => {
    expect(lifeGridRows(0)).toEqual([]);
  });

  it("describes full, partial, and final 52-cell rows", () => {
    expect(lifeGridRows(105)).toEqual([
      {
        age: 0,
        startIndex: 0,
        endIndex: 51,
        cellCount: 52,
        isDecade: true,
        showLabel: true,
      },
      {
        age: 1,
        startIndex: 52,
        endIndex: 103,
        cellCount: 52,
        isDecade: false,
        showLabel: false,
      },
      {
        age: 2,
        startIndex: 104,
        endIndex: 104,
        cellCount: 1,
        isDecade: false,
        showLabel: false,
      },
    ]);
  });

  it("marks five-year and decade label cadence", () => {
    const rows = lifeGridRows(11 * 52);
    expect(rows[0].isDecade).toBe(true);
    expect(rows[5].showLabel).toBe(true);
    expect(rows[5].isDecade).toBe(false);
    expect(rows[10].showLabel).toBe(true);
    expect(rows[10].isDecade).toBe(true);
  });

  it("rejects malformed bounds", () => {
    expect(() => lifeGridRows(-1)).toThrow(RangeError);
    expect(() => lifeGridRows(52.5)).toThrow(RangeError);
    expect(() => lifeGridRows(52, 0)).toThrow(RangeError);
  });
});
