import { describe, it, expect } from "vitest";
import {
  zoneOffsetMsAt,
  zonedWallClockToUtcMs,
  zonedParts,
  calendarAge,
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

describe("zonedParts", () => {
  it("reads a UTC instant's wall-clock parts in the given zone", () => {
    const utcMs = Date.UTC(2021, 0, 1, 0, 30, 0); // 2021-01-01T00:30Z
    expect(zonedParts(utcMs, "UTC")).toEqual({
      year: 2021,
      month: 1,
      day: 1,
      hour: 0,
      minute: 30,
      second: 0,
    });
    // Tokyo is +9h, so the same instant is 09:30 the same calendar day.
    expect(zonedParts(utcMs, "Asia/Tokyo")).toMatchObject({
      year: 2021,
      month: 1,
      day: 1,
      hour: 9,
      minute: 30,
    });
  });
});

describe("calendarAge", () => {
  const at = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi);

  it("is whole years with zero months and days on a birthday", () => {
    const birth = at(1990, 3, 15, 9, 0);
    const now = at(2020, 3, 15, 9, 0);
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 30, m: 0, d: 0 });
  });

  it("ignores the time of day within the anniversary date", () => {
    const birth = at(1990, 3, 15, 9, 0);
    // Earlier in the day than the birth time, but the same calendar date.
    const now = at(2020, 3, 15, 1, 0);
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 30, m: 0, d: 0 });
  });

  it("borrows from the previous month when the day is short", () => {
    const birth = at(1990, 1, 20);
    const now = at(2020, 3, 10);
    // 30y to 2020-01-20, +1mo to 2020-02-20, then 9 days to end of Feb (leap,
    // 29) + 10 into March = 19 days.
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 30, m: 1, d: 19 });
  });

  it("borrows a year when the month is short", () => {
    const birth = at(2000, 11, 10);
    const now = at(2020, 2, 10);
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 19, m: 3, d: 0 });
  });

  it("never yields a negative day for a 31st birth over a short month", () => {
    const birth = at(2000, 1, 31);
    const now = at(2021, 3, 1);
    // Feb has no 31st: the clamp keeps this at 1 day, not a negative.
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 21, m: 1, d: 1 });
  });

  it("evaluates both instants in the given zone", () => {
    // Same two absolute instants, read in two zones. In Los Angeles (UTC-8) the
    // "now" instant falls on the previous calendar day, so the breakdown differs.
    const birth = Date.UTC(2000, 0, 1, 12, 0);
    const now = Date.UTC(2020, 0, 1, 5, 0);
    expect(calendarAge(birth, now, "UTC")).toEqual({ y: 20, m: 0, d: 0 });
    expect(calendarAge(birth, now, "America/Los_Angeles")).toEqual({
      y: 19,
      m: 11,
      d: 30,
    });
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
