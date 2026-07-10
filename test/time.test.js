import { describe, it, expect } from "vitest";
import {
  zoneOffsetMsAt,
  zonedWallClockToUtcMs,
  zonedParts,
  calendarAge,
  parseBirthParts,
  birthInstantMs,
  nextBirthdayInstantMs,
  countdownParts,
  isValidZone,
  detectZone,
  listTimeZones,
  humanizeTimeZone,
  formatUtcOffset,
  buildTimeZoneOptions,
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
    for (const value of [
      "",
      "not-a-date",
      "1990-13-01",
      "1990-05-32",
      "1990-02-30",
      null,
    ]) {
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

describe("nextBirthdayInstantMs", () => {
  const birth = "1990-03-15T09:30";

  it("targets this year's birthday when it is still ahead in the birth zone", () => {
    const now = Date.parse("2024-03-14T00:00:00Z");
    expect(nextBirthdayInstantMs(birth, now, "Asia/Tokyo")).toBe(
      Date.parse("2024-03-15T09:30:00+09:00"),
    );
  });

  it("targets next year's birthday after this year's birth time has passed", () => {
    const now = Date.parse("2024-03-15T00:31:00Z");
    expect(nextBirthdayInstantMs(birth, now, "Asia/Tokyo")).toBe(
      Date.parse("2025-03-15T09:30:00+09:00"),
    );
  });

  it("treats the exact birthday instant as reached and advances a year", () => {
    const now = Date.parse("2024-03-15T09:30:00+09:00");
    expect(nextBirthdayInstantMs(birth, now, "Asia/Tokyo")).toBe(
      Date.parse("2025-03-15T09:30:00+09:00"),
    );
  });

  it("uses the birth zone's calendar year rather than the viewer's", () => {
    const now = Date.parse("2024-01-01T01:00:00Z");
    const newYearBirth = "2000-01-01T00:00";

    // It is already 1 January in Tokyo, but still 31 December in Los Angeles.
    expect(nextBirthdayInstantMs(newYearBirth, now, "Asia/Tokyo")).toBe(
      Date.parse("2025-01-01T00:00:00+09:00"),
    );
    expect(
      nextBirthdayInstantMs(newYearBirth, now, "America/Los_Angeles"),
    ).toBe(Date.parse("2024-01-01T00:00:00-08:00"));
  });

  it("preserves the birth wall-clock time and target-year DST offset", () => {
    const now = Date.parse("2024-01-01T00:00:00Z");
    expect(
      nextBirthdayInstantMs("1990-07-04T18:45", now, "America/New_York"),
    ).toBe(Date.parse("2024-07-04T18:45:00-04:00"));
  });

  it("observes a leap-day birth on 29 February in a leap target year", () => {
    const now = Date.parse("2024-01-01T00:00:00Z");
    expect(nextBirthdayInstantMs("2000-02-29T08:15", now, "UTC")).toBe(
      Date.parse("2024-02-29T08:15:00Z"),
    );
  });

  it("observes a leap-day birth on 28 February in a non-leap target year", () => {
    const now = Date.parse("2023-01-01T00:00:00Z");
    expect(nextBirthdayInstantMs("2000-02-29T08:15", now, "UTC")).toBe(
      Date.parse("2023-02-28T08:15:00Z"),
    );
  });

  it("returns NaN for malformed birth data", () => {
    expect(
      Number.isNaN(
        nextBirthdayInstantMs("2000-02-30T08:15", Date.now(), "UTC"),
      ),
    ).toBe(true);
  });

  it("falls back to the detected zone when the supplied zone is invalid", () => {
    const now = Date.parse("2024-01-01T00:00:00Z");
    expect(nextBirthdayInstantMs(birth, now, "Not/AZone")).toBe(
      nextBirthdayInstantMs(birth, now, detectZone()),
    );
  });
});

describe("countdownParts", () => {
  it("rounds one remaining millisecond up to one second", () => {
    expect(countdownParts(1)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 1,
    });
  });

  it("clamps zero, negative, and non-finite durations", () => {
    const zero = { days: 0, hours: 0, minutes: 0, seconds: 0 };
    expect(countdownParts(0)).toEqual(zero);
    expect(countdownParts(-1)).toEqual(zero);
    expect(countdownParts(NaN)).toEqual(zero);
  });

  it.each([
    [60000, { days: 0, hours: 0, minutes: 1, seconds: 0 }],
    [3600000, { days: 0, hours: 1, minutes: 0, seconds: 0 }],
    [86400000, { days: 1, hours: 0, minutes: 0, seconds: 0 }],
  ])("splits exact unit boundary %i", (remainingMs, expected) => {
    expect(countdownParts(remainingMs)).toEqual(expected);
  });

  it("splits multiple days and rounds a partial second up", () => {
    expect(countdownParts(2 * 86400000 + 3 * 3600000 + 4 * 60000 + 1)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 1,
    });
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

describe("time-zone picker records", () => {
  it("humanizes IANA paths without changing their canonical value", () => {
    expect(humanizeTimeZone("America/Argentina/Buenos_Aires")).toBe(
      "America / Argentina / Buenos Aires",
    );
  });

  it("formats zero, positive, negative, half-, and quarter-hour offsets", () => {
    expect(formatUtcOffset(0)).toBe("UTC");
    expect(formatUtcOffset(9 * HOUR_MS)).toBe("UTC+09:00");
    expect(formatUtcOffset(-5 * HOUR_MS)).toBe("UTC-05:00");
    expect(formatUtcOffset(5.5 * HOUR_MS)).toBe("UTC+05:30");
    expect(formatUtcOffset(5.75 * HOUR_MS)).toBe("UTC+05:45");
  });

  it("builds searchable labels using offsets at the supplied instant", () => {
    const winter = Date.UTC(2024, 0, 15, 12);
    const records = buildTimeZoneOptions("UTC", "America/New_York", winter);
    expect(records.find(({ value }) => value === "UTC")).toMatchObject({
      value: "UTC",
      label: "UTC",
      meta: "",
      displayText: "UTC",
    });
    expect(
      records.find(({ value }) => value === "America/New_York"),
    ).toMatchObject({
      label: "America / New York",
      meta: "UTC-05:00",
    });
    expect(records.find(({ value }) => value === "Asia/Tokyo").meta).toBe(
      "UTC+09:00",
    );
    const quarterHour = buildTimeZoneOptions("Asia/Kathmandu", "UTC", winter);
    expect(
      quarterHour.find(({ value }) => value === "Asia/Kathmandu").meta,
    ).toBe("UTC+05:45");
  });

  it("uses the current DST offset at the frozen render instant", () => {
    const winter = buildTimeZoneOptions(
      "America/New_York",
      "UTC",
      Date.UTC(2024, 0, 15, 12),
    );
    const summer = buildTimeZoneOptions(
      "America/New_York",
      "UTC",
      Date.UTC(2024, 6, 15, 12),
    );
    expect(winter.find(({ value }) => value === "America/New_York").meta).toBe(
      "UTC-05:00",
    );
    expect(summer.find(({ value }) => value === "America/New_York").meta).toBe(
      "UTC-04:00",
    );
  });

  it("retains the curated zones when supportedValuesOf is unavailable", () => {
    const original = Intl.supportedValuesOf;
    Object.defineProperty(Intl, "supportedValuesOf", {
      value: undefined,
      configurable: true,
    });
    try {
      const records = buildTimeZoneOptions(
        "Asia/Tokyo",
        "UTC",
        Date.UTC(2024, 0, 1),
      );
      expect(records.map(({ value }) => value)).toContain("Asia/Tokyo");
      expect(records.map(({ value }) => value)).toContain("America/New_York");
    } finally {
      Object.defineProperty(Intl, "supportedValuesOf", {
        value: original,
        configurable: true,
      });
    }
  });
});
