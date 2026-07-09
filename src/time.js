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
  if (day < 1 || day > 31) return null;
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

/**
 * Absolute birth instant (ms) for a stored birth string, interpreted in
 * `timeZone`. Falls back to the detected zone if `timeZone` is missing or
 * unresolvable; returns NaN when the birth string itself can't be parsed.
 * @returns {number}
 */
export function birthInstantMs(birth, timeZone) {
  const p = parseBirthParts(birth);
  if (!p) return NaN;
  const zone = isValidZone(timeZone) ? timeZone : detectZone();
  return zonedWallClockToUtcMs(p.year, p.month, p.day, p.hour, p.minute, zone);
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
