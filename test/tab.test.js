import { describe, it, expect } from "vitest";
import { clampExpectancy, formatBorn } from "../src/tab.js";

describe("clampExpectancy", () => {
  it("keeps in-range integers", () => {
    expect(clampExpectancy(80)).toBe(80);
    expect(clampExpectancy(1)).toBe(1);
    expect(clampExpectancy(150)).toBe(150);
    expect(clampExpectancy("42")).toBe(42);
  });

  it("defaults to 80 for non-numeric input", () => {
    for (const value of ["", "abc", null, undefined, NaN]) {
      expect(clampExpectancy(value)).toBe(80);
    }
  });

  it("clamps values below 1 up to 1", () => {
    expect(clampExpectancy(0)).toBe(1);
    expect(clampExpectancy(-10)).toBe(1);
  });

  it("clamps values above 150 down to 150", () => {
    expect(clampExpectancy(151)).toBe(150);
    expect(clampExpectancy(9999)).toBe(150);
  });

  it("parses leading integers out of mixed strings", () => {
    expect(clampExpectancy("90 years")).toBe(90);
    expect(clampExpectancy("73.9")).toBe(73);
  });
});

describe("formatBorn", () => {
  it("formats a valid birth timestamp", () => {
    const formatted = formatBorn("1990-05-15T00:00");
    expect(formatted.startsWith("Born ")).toBe(true);
    expect(formatted).toContain("1990");
  });

  it("returns an empty string for an unparseable value", () => {
    expect(formatBorn("not-a-date")).toBe("");
    expect(formatBorn("")).toBe("");
  });
});
