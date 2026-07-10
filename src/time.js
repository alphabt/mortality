// Dependency-free timezone math. A birth is stored as a wall-clock string with
// no offset ("1990-03-15T09:00"); `new Date(that)` would parse it in whatever
// zone the *device* currently sits in, so the birth INSTANT — and therefore the
// 9-decimal age — silently shifts when the user travels or emigrates. These
// helpers anchor the instant to the zone the user was actually born in, using
// only the built-in Intl database (DST and historical offsets included).

// A small spread of common zones for the rare engine without
// Intl.supportedValuesOf (pre-2022), so the setup picker still works.
const FALLBACK_ZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/**
 * Milliseconds `timeZone` is ahead of UTC at the given instant (positive east
 * of UTC). Formats the instant *in the zone*, reads the wall-clock components
 * back, and treats them as if they were UTC — the difference is the offset. Any
 * DST/historical shift is captured because it asks the zone at that exact time.
 * @param {number} utcMs Absolute time (ms since epoch).
 * @param {string} timeZone IANA zone id, e.g. "Asia/Tokyo".
 * @returns {number}
 */
export function zoneOffsetMsAt(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  const asIfUtc = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return asIfUtc - utcMs;
}

/**
 * Wall-clock calendar parts of a UTC instant as seen in `timeZone`. Reads the
 * components straight from the Intl database (DST and historical offsets
 * included) so the values match what a clock on the wall in that zone shows.
 * @param {number} utcMs Absolute time (ms since epoch).
 * @param {string} timeZone IANA zone id, e.g. "Asia/Tokyo".
 * @returns {{year:number,month:number,day:number,hour:number,minute:number,second:number}}
 */
export function zonedParts(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  );
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}

/** Number of days in a 1-based month, wrapping month 0 to the prior December. */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * True calendar age between two instants as whole years, months and days (e.g.
 * `{y:36, m:3, d:24}`). BOTH instants are read in `timeZone` so the anniversary
 * lines up with the birthplace and stays stable wherever the viewer sits.
 *
 * Borrow-based subtraction: when the day component is short of the birthday, we
 * borrow the real length of the month preceding `nowMs`; when months go
 * negative we borrow a year. The birth day is clamped into the (possibly
 * shorter) borrowed month, so a birth on the 29th–31st can never push the day
 * count negative when that month is short — e.g. born the 31st with February in
 * between resolves to 1 day, not a negative.
 * @param {number} birthInstantMs Absolute birth instant (ms since epoch).
 * @param {number} nowMs Absolute current instant (ms since epoch).
 * @param {string} timeZone IANA zone id the breakdown is evaluated in.
 * @returns {{y:number,m:number,d:number}}
 */
export function calendarAge(birthInstantMs, nowMs, timeZone) {
  const b = zonedParts(birthInstantMs, timeZone);
  const n = zonedParts(nowMs, timeZone);

  let y = n.year - b.year;
  let m = n.month - b.month;
  let d = n.day - b.day;

  if (d < 0) {
    m -= 1;
    const prevMonthLen = daysInMonth(n.year, n.month - 1);
    // Days elapsed since the birthday anniversary in that previous month, with
    // the birth day clamped to the month's real length.
    d = prevMonthLen - Math.min(b.day, prevMonthLen) + n.day;
  }
  if (m < 0) {
    m += 12;
    y -= 1;
  }
  return { y, m, d };
}

/**
 * Absolute UTC instant (ms) for a wall-clock date/time interpreted *in*
 * `timeZone`. Two-pass: guess with a naive UTC assembly, correct by the zone's
 * real offset, then re-check in case that correction crossed a DST boundary.
 * @returns {number}
 */
export function zonedWallClockToUtcMs(y, mo, d, h, mi, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = zoneOffsetMsAt(guess, timeZone);
  let utc = guess - off1;
  const off2 = zoneOffsetMsAt(utc, timeZone);
  if (off2 !== off1) utc = guess - off2;
  return utc;
}

/**
 * Split a stored birth string ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm") into numeric
 * parts. Returns null for anything malformed. We parse the digits ourselves so
 * the value is never handed to `new Date`, which would reinterpret it in the
 * viewer's local zone.
 * @param {unknown} birth
 * @returns {{year:number,month:number,day:number,hour:number,minute:number}|null}
 */
export function parseBirthParts(birth) {
  if (typeof birth !== "string") return null;
  const m = birth.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?$/,
  );
  if (!m) return null;
  const year = +m[1];
  const month = +m[2];
  const day = +m[3];
  const hour = m[4] === undefined ? 0 : +m[4];
  const minute = m[5] === undefined ? 0 : +m[5];
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59) return null;
  return { year, month, day, hour, minute };
}

/** True when `zone` is an IANA id the runtime can actually resolve. */
export function isValidZone(zone) {
  if (typeof zone !== "string" || !zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

function resolvedZone(timeZone) {
  return isValidZone(timeZone) ? timeZone : detectZone();
}

/**
 * Absolute birth instant (ms) for a stored birth string, interpreted in
 * `timeZone`. Falls back to the detected zone if `timeZone` is missing or
 * unresolvable; returns NaN when the birth string itself can't be parsed.
 * @returns {number}
 */
export function birthInstantMs(birth, timeZone) {
  const p = parseBirthParts(birth);
  if (!p) return NaN;
  const zone = resolvedZone(timeZone);
  return zonedWallClockToUtcMs(p.year, p.month, p.day, p.hour, p.minute, zone);
}

/**
 * Absolute instant of the next birthday after `nowMs`, observed in the stored
 * birth zone at the original wall-clock time. A 29 February birth is observed
 * on 28 February in non-leap years: clamping to the target month's final day
 * also guarantees the converter never receives an invalid calendar date.
 * Returns NaN for malformed birth data or a non-finite current instant.
 * @param {unknown} birth Stored wall-clock birth string.
 * @param {number} nowMs Absolute current instant (ms since epoch).
 * @param {string} timeZone IANA birthplace zone id.
 * @returns {number}
 */
export function nextBirthdayInstantMs(birth, nowMs, timeZone) {
  const p = parseBirthParts(birth);
  if (!p || !Number.isFinite(nowMs)) return NaN;

  const zone = resolvedZone(timeZone);
  const currentYear = zonedParts(nowMs, zone).year;
  const inYear = (year) =>
    zonedWallClockToUtcMs(
      year,
      p.month,
      Math.min(p.day, daysInMonth(year, p.month)),
      p.hour,
      p.minute,
      zone,
    );

  const thisYear = inYear(currentYear);
  return thisYear > nowMs ? thisYear : inYear(currentYear + 1);
}

/**
 * Break a remaining duration into display-ready whole countdown units. Rounding
 * up to the next second prevents an all-zero reading before the target instant.
 * @param {number} remainingMs
 * @returns {{days:number,hours:number,minutes:number,seconds:number}}
 */
export function countdownParts(remainingMs) {
  let seconds = Number.isFinite(remainingMs)
    ? Math.max(0, Math.ceil(remainingMs / 1000))
    : 0;
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return { days, hours, minutes, seconds };
}

/** The device's current IANA zone (e.g. "Asia/Tokyo"), or "UTC" if unknown. */
export function detectZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Every IANA zone the runtime knows, or the curated fallback list, as a sorted
 * array. Any ids passed as `ensure` are guaranteed to appear (so the picker can
 * always select the detected or previously-saved zone, even a legacy alias the
 * runtime omits from its canonical list).
 * @param {...string} ensure
 * @returns {string[]}
 */
export function listTimeZones(...ensure) {
  let zones;
  try {
    zones =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : FALLBACK_ZONES.slice();
  } catch {
    zones = FALLBACK_ZONES.slice();
  }
  const set = new Set(zones);
  for (const zone of ensure) {
    if (zone) set.add(zone);
  }
  return [...set].sort();
}

/** Turn an IANA id into a readable but deliberately non-localized label. */
export function humanizeTimeZone(zone) {
  return String(zone)
    .split("/")
    .map((part) => part.replaceAll("_", " "))
    .join(" / ");
}

/** Format a UTC offset, preserving half- and quarter-hour offsets. */
export function formatUtcOffset(offsetMs) {
  if (!Number.isFinite(offsetMs)) {
    throw new TypeError("Time-zone offset must be finite");
  }
  const totalMinutes = Math.round(offsetMs / 60000);
  if (totalMinutes === 0) return "UTC";
  const sign = totalMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(totalMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${minutes}`;
}

/**
 * Search-select records for every supported time zone at one frozen instant.
 * Canonical values are never humanized or otherwise altered.
 */
export function buildTimeZoneOptions(selected, detected, nowMs = Date.now()) {
  return listTimeZones(selected, detected).map((zone) => {
    const label = humanizeTimeZone(zone);
    const offset = isValidZone(zone)
      ? formatUtcOffset(zoneOffsetMsAt(nowMs, zone))
      : "";
    const meta = label === "UTC" && offset === "UTC" ? "" : offset;
    return {
      value: zone,
      label,
      meta,
      displayText: [label, meta].filter(Boolean).join(" \u00b7 "),
      searchText: `${zone} ${label} ${meta}`,
      dir: "ltr",
    };
  });
}
