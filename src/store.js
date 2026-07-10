// Persistence + theming. No dependencies, runs directly in the browser.

import {
  birthInstantMs,
  detectZone,
  isValidZone,
  parseBirthParts,
} from "./time.js";
import {
  DEFAULT_LIFE_TABLE,
  estimateExpectancy,
  normalizeLifeTable,
} from "./lifetable.js";

const KEY = "mortality";

// Colors the user can customise. Each maps to a CSS custom property (--<key>).
export const THEME_KEYS = ["bg", "label", "count", "accent"];
export const CONTRAST_MIN = Object.freeze({
  label: 4.5,
  count: 4.5,
  accent: 3,
});

// Numeral typefaces for the big count, chosen in Settings. Each maps to a
// --num-font value applied by applyTypeface (see below); "system" clears it.
export const TYPEFACES = ["system", "grotesk", "mono"];

// Counter display units, cycled by clicking the number.
export const MODES = [
  "years",
  "calendar",
  "birthday",
  "days",
  "weeks",
  "yearsLeft",
  "daysLeft",
  "weeksLeft",
];

// Curated full-theme presets. Every set is contrast-checked (count & label ≥4.5:1
// on bg, accent ≥3:1). Applying one writes all four THEME_KEYS at once.
// Light and Dark mirror the stylesheet defaults in tab.css (:root and the
// prefers-color-scheme: dark block) so the shipped looks are selectable presets,
// letting anyone return to them after trying another preset or custom colors.
export const PRESETS = {
  Light: {
    bg: "#ffffff",
    label: "#6f747a",
    count: "#494949",
    accent: "#007ea6",
  },
  Dark: {
    bg: "#222222",
    label: "#898f97",
    count: "#b0b5b9",
    accent: "#007ea6",
  },
  Paper: {
    bg: "#fafaf8",
    label: "#5f6469",
    count: "#1b1b1b",
    accent: "#b23a2e",
  },
  Void: {
    bg: "#0a0a0a",
    label: "#8b9198",
    count: "#ededed",
    accent: "#5cc2ea",
  },
  Terminal: {
    bg: "#0a0f0a",
    label: "#6f9a80",
    count: "#4ee08a",
    accent: "#8effc0",
  },
  Blueprint: {
    bg: "#0e1b2a",
    label: "#8398ad",
    count: "#e6ecf2",
    accent: "#5a9be0",
  },
  Amber: {
    bg: "#1a1512",
    label: "#a08b76",
    count: "#ecdcc6",
    accent: "#e0a24e",
  },
};

const DEFAULTS = {
  version: 1,
  birth: null,
  birthZone: null,
  theme: null,
  expectancy: 80,
  expectancySource: "estimate",
  sex: null,
  lifeTable: DEFAULT_LIFE_TABLE,
  mode: "years",
  typeface: "system",
  reflection: false,
  language: "auto",
};

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Clamp a life-expectancy value to the supported whole-year band [1, 150],
 * parsing leading integers out of strings. Non-numeric input falls back to 80
 * (the historical default). Lives here — not in the controller — so both the
 * store's resolver and the controller can share one definition without a
 * circular import (tab.js re-exports it).
 * @param {unknown} value
 * @returns {number}
 */
export function clampExpectancy(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 80;
  return Math.min(150, Math.max(1, n));
}

/**
 * Resolve the life expectancy actually in force for a given attained age. When
 * the user pins a custom number we honour it verbatim (clamped); otherwise we
 * derive an actuarial estimate from their age and optional sex at birth. Falls
 * back to the clamped custom value whenever the age can't be computed (e.g. no
 * birthday yet), so the counter always has a sane denominator. Pure.
 * @param {{expectancySource?: string, expectancy?: unknown, sex?: string|null, lifeTable?: string}} state
 * @param {number} ageYears Attained age in years (may be fractional or NaN).
 * @returns {number}
 */
export function effectiveExpectancy(state, ageYears) {
  const source = state && state.expectancySource;
  const custom = clampExpectancy(state && state.expectancy);
  if (source === "custom") return custom;
  if (!Number.isFinite(ageYears)) return custom;
  return estimateExpectancy(
    ageYears,
    state ? state.sex : null,
    state ? state.lifeTable : DEFAULT_LIFE_TABLE,
  );
}

// Extension storage.local persists across the privacy/history clearing that can
// silently wipe localStorage on extension pages (Firefox especially, issue #16).
// Promise-based in Firefox (browser.*) and Chrome/Edge MV3 (chrome.*, 88+). When
// the page runs outside an extension (dev preview, tests), those APIs are absent,
// so fall back to a localStorage-backed shim with the same async shape.
const extApi = globalThis.browser ?? globalThis.chrome;
const hasExtStorage = !!extApi?.storage?.local;
const storage = hasExtStorage
  ? extApi.storage.local
  : {
      async get(key) {
        try {
          const raw = localStorage.getItem(key);
          return raw ? { [key]: JSON.parse(raw) } : {};
        } catch {
          return {};
        }
      },
      async set(items) {
        try {
          for (const [k, v] of Object.entries(items)) {
            localStorage.setItem(k, JSON.stringify(v));
          }
        } catch {
          // ignore write failures (private mode, quota)
        }
      },
    };

/** Read any pre-storage data still sitting in localStorage, or null. */
function readLegacy() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore malformed JSON
  }
  try {
    // The old published format stored the birthday as localStorage.dob.
    const dob = localStorage.getItem("dob");
    if (dob) return { birth: dob };
  } catch {
    // ignore inaccessible localStorage
  }
  return null;
}

/** Drop migrated legacy keys so they can't shadow future reads. */
function clearLegacy() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("dob");
  } catch {
    // ignore inaccessible localStorage
  }
}

/**
 * Lock the birth INSTANT for records saved before timezone support. Their birth
 * was a bare wall-clock string whose age was computed by parsing it in the
 * device's *current* local zone, so backfilling birthZone with the detected
 * zone keeps today's displayed age identical while anchoring the instant — from
 * now on it can't drift if the user travels. Returns the state unchanged (same
 * reference) when there is nothing to backfill.
 */
function backfillZone(state) {
  if (state.birth && !state.birthZone) {
    return { ...state, birthZone: detectZone() };
  }
  return state;
}

/**
 * Migrate a pre-existing record onto the actuarial-expectancy model. Only a
 * BRAND-NEW install (raw === null) defaults `expectancySource` to "estimate";
 * any record that already lived on disk before this feature lacked the field, so
 * it's pinned to "custom" — preserving the exact number that user has always
 * seen (their flat 80, or whatever they set) rather than silently swapping in an
 * age-based estimate on update. `sex` is backfilled to null and `lifeTable` to
 * the neutral World baseline when absent. Returns the state unchanged (same
 * reference) when there is nothing to migrate.
 * @param {object} state  State already merged over DEFAULTS.
 * @param {unknown} raw  The value as read from storage/legacy.
 */
function migrateExpectancy(state, raw) {
  if (!isRecord(raw)) return state; // brand-new/invalid → keep the defaults
  const patch = {};
  if (!("expectancySource" in raw)) patch.expectancySource = "custom";
  if (!("sex" in raw)) patch.sex = null;
  if (
    !("lifeTable" in raw) ||
    normalizeLifeTable(raw.lifeTable) !== raw.lifeTable
  ) {
    patch.lifeTable = DEFAULT_LIFE_TABLE;
  }
  return Object.keys(patch).length ? { ...state, ...patch } : state;
}

function normalizeStoredTheme(state) {
  if (state.theme == null) return state;
  const theme = normalizeTheme(state.theme);
  const unchanged =
    theme &&
    THEME_KEYS.every(
      (key) => theme[key] === String(state.theme?.[key] || "").toLowerCase(),
    );
  return unchanged ? state : { ...state, theme };
}

function normalizeStoredBirth(state) {
  if (state.birth == null) {
    return state.birthZone == null ? state : { ...state, birthZone: null };
  }
  const hasValidZone = isValidZone(state.birthZone);
  const zone = hasValidZone ? state.birthZone : detectZone();
  const bornMs = birthInstantMs(state.birth, zone);
  if (
    parseBirthParts(state.birth) &&
    Number.isFinite(bornMs) &&
    bornMs <= Date.now()
  ) {
    return hasValidZone ? state : { ...state, birthZone: zone };
  }
  return { ...state, birth: null, birthZone: null };
}

/**
 * Load persisted state, applying defaults and migrating older localStorage data
 * (the "mortality" JSON blob or the legacy "dob" string) on first run. Records
 * that predate timezone support get their birthZone backfilled with the
 * detected zone (see backfillZone) so the birth instant is anchored going
 * forward without changing the age shown today. Records that predate the
 * actuarial-expectancy feature keep their flat number by being pinned to a
 * "custom" expectancy source (see migrateExpectancy).
 * @returns {Promise<{ version: number, birth: string|null, birthZone: string|null, theme: Record<string,string>|null, expectancy: number, expectancySource: string, sex: string|null, lifeTable: string, mode: string, typeface: string, reflection: boolean, language: string }>}
 */
export async function load() {
  let stored;
  try {
    stored = (await storage.get(KEY))[KEY];
  } catch {
    stored = null;
  }

  const invalidStored = stored != null && !isRecord(stored);
  if (invalidStored) stored = null;

  if (!stored) {
    const legacy = readLegacy();
    if (isRecord(legacy)) {
      const migrated = normalizeStoredBirth(
        normalizeStoredTheme(
          migrateExpectancy(backfillZone({ ...DEFAULTS, ...legacy }), legacy),
        ),
      );
      await save(migrated);
      // Only clear localStorage when a real extension store now owns the data;
      // under the localStorage shim, KEY *is* the store we just wrote to.
      if (hasExtStorage) clearLegacy();
      return migrated;
    }
    if (invalidStored || legacy != null) {
      const defaults = { ...DEFAULTS };
      await save(defaults);
      if (hasExtStorage) clearLegacy();
      return defaults;
    }
  }

  const state = { ...DEFAULTS, ...stored };
  const migrated = migrateExpectancy(state, stored);
  const themed = normalizeStoredTheme(migrated);
  const backfilled = backfillZone(themed);
  const normalized = normalizeStoredBirth(backfilled);
  if (normalized !== state) await save(normalized);
  return normalized;
}

/** Persist state. */
export async function save(state) {
  await storage.set({ [KEY]: state });
}

/** Current effective value of a --<key> CSS custom property (hex). */
export function cssDefault(key) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--${key}`)
    .trim();
  return value || "#000000";
}

/** Relative luminance of a #rrggbb color (WCAG). */
function luminance(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a),
    lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const short = value.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    return `#${[...short[1]].map((digit) => digit.repeat(2)).join("")}`.toLowerCase();
  }
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/**
 * Return a complete, normalized theme only when every value is a CSS hex color
 * and the palette meets Mortality's WCAG contrast contract. Invalid or partial
 * palettes resolve to null so callers can safely fall back to the system theme.
 */
export function normalizeTheme(theme) {
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) return null;
  const normalized = {};
  for (const key of THEME_KEYS) {
    const value = normalizeHex(theme[key]);
    if (!value) return null;
    normalized[key] = value;
  }
  for (const [key, minimum] of Object.entries(CONTRAST_MIN)) {
    if (contrast(normalized[key], normalized.bg) < minimum) return null;
  }
  return normalized;
}

/** Pick a preferred ink that always meets normal-text contrast on an accent. */
export function bestOnColor(hex) {
  const light = contrast("#ffffff", hex);
  const dark = contrast("#141414", hex);
  if (light >= 4.5 && light >= dark) return "#ffffff";
  if (dark >= 4.5) return "#141414";
  return "#000000";
}

/**
 * Apply user colour overrides as inline custom properties (they win over the
 * stylesheet's light/dark defaults). Pass null to clear and follow the system.
 * Also derives --on-accent from the effective accent so button text stays
 * legible for any accent the user (or a preset) picks.
 */
export function applyTheme(theme) {
  const applied = normalizeTheme(theme);
  const root = document.documentElement.style;
  THEME_KEYS.forEach((key) => {
    if (applied) root.setProperty(`--${key}`, applied[key]);
    else root.removeProperty(`--${key}`);
  });
  if (applied) root.setProperty("--focus", applied.accent);
  else root.removeProperty("--focus");
  root.setProperty("--on-accent", bestOnColor(cssDefault("accent")));
}

/**
 * Set the numeral typeface for the big count as an inline custom property, so it
 * survives setScreen() rewriting body.className (a body class would not). "mono"
 * and "grotesk" pick a font stack; anything else clears the override and the
 * number inherits the page font (see the `.count` rule's var(--num-font)).
 */
export function applyTypeface(typeface) {
  const root = document.documentElement.style;
  if (typeface === "mono") {
    root.setProperty(
      "--num-font",
      'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    );
  } else if (typeface === "grotesk") {
    root.setProperty(
      "--num-font",
      '"Avenir Next", "Helvetica Neue", Arial, sans-serif',
    );
  } else {
    root.removeProperty("--num-font");
  }
}
