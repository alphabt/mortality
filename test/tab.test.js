import { describe, it, expect } from "vitest";
import {
  clampExpectancy,
  formatBorn,
  lifeWeeks,
  reflectionLine,
  formatProgressCaption,
  mergeImported,
} from "../src/tab.js";

const YEAR_MS = 31556900000;

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

const WEEK_MS = 7 * 86400000;

describe("lifeWeeks", () => {
  it("has zero lived weeks and expectancy*52 total at birth", () => {
    expect(lifeWeeks(0, 80)).toEqual({ lived: 0, total: 4160 });
  });

  it("counts whole weeks elapsed", () => {
    expect(lifeWeeks(WEEK_MS * 10, 80).lived).toBe(10);
  });

  it("clamps negative elapsed time to zero lived weeks", () => {
    expect(lifeWeeks(-WEEK_MS * 5, 80).lived).toBe(0);
  });

  it("never lets lived exceed the total number of cells", () => {
    const { lived, total } = lifeWeeks(Number.MAX_SAFE_INTEGER, 80);
    expect(total).toBe(4160);
    expect(lived).toBe(total);
  });

  it("scales the total with the clamped expectancy", () => {
    expect(lifeWeeks(0, 200).total).toBe(150 * 52);
    expect(lifeWeeks(0, "abc").total).toBe(80 * 52);
  });
});

describe("reflectionLine", () => {
  it("reports whole years behind and ahead against the expectancy", () => {
    const born = 0;
    const now = 30 * YEAR_MS;
    expect(reflectionLine(born, now, 80)).toBe(
      "30 years behind you \u00b7 50 ahead, if the tables hold.",
    );
  });

  describe("formatProgressCaption", () => {
    it("preserves the historical floor rather than rounding up", () => {
      expect(formatProgressCaption(0.246, 80)).toBe("24% of 80 yrs lived");
      expect(formatProgressCaption(0.999, 80)).toBe("99% of 80 yrs lived");
    });
  });

  it("floors the years lived rather than rounding", () => {
    const now = 29.9 * YEAR_MS;
    expect(reflectionLine(0, now, 80)).toBe(
      "29 years behind you \u00b7 51 ahead, if the tables hold.",
    );
  });

  it("never lets the years ahead go negative past the expectancy", () => {
    const now = 100 * YEAR_MS;
    expect(reflectionLine(0, now, 80)).toBe(
      "100 years behind you \u00b7 0 ahead, if the tables hold.",
    );
  });

  it("clamps negative lived time (future birth) to zero behind", () => {
    expect(reflectionLine(YEAR_MS, 0, 80)).toBe(
      "0 years behind you \u00b7 80 ahead, if the tables hold.",
    );
  });
});

describe("mergeImported", () => {
  const current = {
    version: 1,
    birth: "2000-01-01T00:00",
    birthZone: "Asia/Tokyo",
    theme: null,
    expectancy: 80,
    expectancySource: "estimate",
    sex: null,
    lifeTable: "world",
    mode: "years",
    typeface: "system",
    reflection: false,
    language: "auto",
  };

  it("copies known keys from the import", () => {
    const merged = mergeImported(current, {
      birth: "1990-05-15T09:00",
      birthZone: "Europe/London",
      theme: { bg: "#000000" },
      mode: "days",
      typeface: "mono",
      reflection: true,
      language: "pt-BR",
    });
    expect(merged.birth).toBe("1990-05-15T09:00");
    expect(merged.birthZone).toBe("Europe/London");
    expect(merged.theme).toEqual({ bg: "#000000" });
    expect(merged.mode).toBe("days");
    expect(merged.typeface).toBe("mono");
    expect(merged.reflection).toBe(true);
    expect(merged.language).toBe("pt_BR");
  });

  it("clamps an imported expectancy into range", () => {
    expect(mergeImported(current, { expectancy: 999 }).expectancy).toBe(150);
    expect(mergeImported(current, { expectancy: 0 }).expectancy).toBe(1);
    expect(mergeImported(current, { expectancy: "62" }).expectancy).toBe(62);
  });

  it("accepts a valid sex and coerces anything else to null", () => {
    expect(mergeImported(current, { sex: "male" }).sex).toBe("male");
    expect(mergeImported(current, { sex: "female" }).sex).toBe("female");
    expect(mergeImported(current, { sex: "other" }).sex).toBeNull();
    expect(mergeImported(current, { sex: 123 }).sex).toBeNull();
    expect(mergeImported(current, { sex: null }).sex).toBeNull();
  });

  it("accepts a valid expectancy source and ignores an invalid one", () => {
    expect(
      mergeImported(current, { expectancySource: "custom" }).expectancySource,
    ).toBe("custom");
    expect(
      mergeImported(current, { expectancySource: "estimate" }).expectancySource,
    ).toBe("estimate");
    // An unrecognised value keeps the current source rather than corrupting it.
    expect(
      mergeImported(current, { expectancySource: "banana" }).expectancySource,
    ).toBe(current.expectancySource);
  });

  it("accepts known life tables and resets an unknown one to World", () => {
    expect(mergeImported(current, { lifeTable: "us" }).lifeTable).toBe("us");
    expect(mergeImported(current, { lifeTable: "world" }).lifeTable).toBe(
      "world",
    );
    expect(mergeImported(current, { lifeTable: "un:392" }).lifeTable).toBe(
      "un:392",
    );
    expect(mergeImported(current, { lifeTable: "timezone" }).lifeTable).toBe(
      "world",
    );
  });

  it("falls back to the system typeface for an unknown value", () => {
    expect(mergeImported(current, { typeface: "comic-sans" }).typeface).toBe(
      "system",
    );
  });

  it("coerces reflection to a boolean", () => {
    expect(mergeImported(current, { reflection: 1 }).reflection).toBe(true);
    expect(mergeImported(current, { reflection: "" }).reflection).toBe(false);
  });

  it("falls back to the browser language for an unknown imported language", () => {
    expect(mergeImported(current, { language: "klingon" }).language).toBe(
      "auto",
    );
  });

  it("keeps a non-string birth from corrupting state", () => {
    expect(mergeImported(current, { birth: 12345 }).birth).toBeNull();
  });

  it("ignores an unknown mode, keeping the current one", () => {
    expect(mergeImported(current, { mode: "sideways" }).mode).toBe("years");
  });

  it("ignores unknown keys entirely", () => {
    const merged = mergeImported(current, { evil: "payload", foo: 1 });
    expect(merged).not.toHaveProperty("evil");
    expect(merged).not.toHaveProperty("foo");
  });

  it("keeps the current value for any key the import omits", () => {
    const merged = mergeImported(current, { mode: "weeks" });
    expect(merged.birth).toBe(current.birth);
    expect(merged.birthZone).toBe(current.birthZone);
    expect(merged.expectancy).toBe(current.expectancy);
    expect(merged.typeface).toBe(current.typeface);
    expect(merged.reflection).toBe(current.reflection);
    expect(merged.language).toBe(current.language);
  });

  it("tolerates a non-object import", () => {
    expect(mergeImported(current, null)).toEqual(current);
    expect(mergeImported(current, "nope")).toEqual(current);
  });
});
