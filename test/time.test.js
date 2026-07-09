import { describe, it, expect } from "vitest";
import {
  zoneOffsetMsAt,
  zonedWallClockToUtcMs,
  parseBirthParts,
  birthInstantMs,
  isValidZone,
  detectZone,
  listTimeZones,
} from "../src/time.js";

const HOUR_MS = 3600000;

describe("zoneOffsetMsAt", () => {
  it("reports a fixed-offset zone's offset from UTC", () => {
    const utcMs = Date.UTC(2021, 0, 1, 0, 0, 0);
    expect(zoneOffsetMsAt(utcMs, "Asia/Tokyo")).toBe(9 * HOUR_MS);
    expect(zoneOffsetMsAt(utcMs, "UTC")).toBe(0);
  });

  it("tracks daylight saving across the year", () => {
    const winter = Date.UTC(2021, 0, 1, 12, 0, 0);
    const summer = Date.UTC(2021, 6, 1, 12, 0, 0);
    expect(zoneOffsetMsAt(winter, "America/New_York")).toBe(-5 * HOUR_MS);
    expect(zoneOffsetMsAt(summer, "America/New_York")).toBe(-4 * HOUR_MS);
  });
});

describe("zonedWallClockToUtcMs", () => {
  it("anchors a wall clock to the correct absolute instant", () => {
    expect(zonedWallClockToUtcMs(1990, 3, 15, 9, 0, "Asia/Tokyo")).toBe(
      Date.parse("1990-03-15T09:00:00+09:00"),
    );
  });

  it("uses the offset in effect at that historical date (DST-aware)", () => {
    // Same wall clock, opposite sides of the DST switch → different instants.
    expect(zonedWallClockToUtcMs(2021, 1, 1, 0, 0, "America/New_York")).toBe(
      Date.parse("2021-01-01T00:00:00-05:00"),
    );
    expect(zonedWallClockToUtcMs(2021, 7, 1, 0, 0, "America/New_York")).toBe(
      Date.parse("2021-07-01T00:00:00-04:00"),
    );
  });

  it("differs from a naive local parse for a far-away zone", () => {
    const tokyo = zonedWallClockToUtcMs(2000, 1, 1, 0, 0, "Asia/Tokyo");
    const la = zonedWallClockToUtcMs(2000, 1, 1, 0, 0, "America/Los_Angeles");
    // Midnight Jan 1 2000 is a different instant in Tokyo than in LA.
    expect(la - tokyo).toBe(17 * HOUR_MS);
  });
});

describe("parseBirthParts", () => {
  it("parses a date+time string", () => {
    expect(parseBirthParts("1990-03-15T09:00")).toEqual({
      year: 1990,
      month: 3,
      day: 15,
      hour: 9,
      minute: 0,
    });
  });

  it("parses a date-only string as midnight", () => {
    expect(parseBirthParts("1985-07-20")).toEqual({
      year: 1985,
      month: 7,
      day: 20,
      hour: 0,
      minute: 0,
    });
  });

  it("returns null for malformed or out-of-range values", () => {
    for (const value of ["", "not-a-date", "1990-13-01", "1990-05-32", null]) {
      expect(parseBirthParts(value)).toBeNull();
    }
  });
});

describe("birthInstantMs", () => {
  it("interprets the stored string in the given zone", () => {
    expect(birthInstantMs("1990-03-15T09:00", "Asia/Tokyo")).toBe(
      Date.parse("1990-03-15T09:00:00+09:00"),
    );
  });

  it("returns NaN for an unparseable birth string", () => {
    expect(Number.isNaN(birthInstantMs("nope", "Asia/Tokyo"))).toBe(true);
  });

  it("falls back to the detected zone when the zone is invalid", () => {
    const detected = detectZone();
    expect(birthInstantMs("2000-01-01T00:00", "Not/AZone")).toBe(
      birthInstantMs("2000-01-01T00:00", detected),
    );
  });
});

describe("isValidZone", () => {
  it("accepts resolvable IANA ids and rejects the rest", () => {
    expect(isValidZone("Asia/Tokyo")).toBe(true);
    expect(isValidZone("UTC")).toBe(true);
    expect(isValidZone("Not/AZone")).toBe(false);
    expect(isValidZone("")).toBe(false);
    expect(isValidZone(null)).toBe(false);
  });
});

describe("detectZone", () => {
  it("returns a non-empty zone id", () => {
    const zone = detectZone();
    expect(typeof zone).toBe("string");
    expect(zone.length).toBeGreaterThan(0);
  });
});

describe("listTimeZones", () => {
  it("returns a sorted list that includes common zones", () => {
    const zones = listTimeZones();
    expect(Array.isArray(zones)).toBe(true);
    expect(zones).toContain("Asia/Tokyo");
    expect([...zones].sort()).toEqual(zones);
  });

  it("guarantees any `ensure` ids appear exactly once", () => {
    const zones = listTimeZones("Custom/Place", "Asia/Tokyo");
    expect(zones).toContain("Custom/Place");
    expect(zones.filter((z) => z === "Asia/Tokyo")).toHaveLength(1);
  });
});
