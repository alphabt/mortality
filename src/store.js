// Persistence + theming. No dependencies, runs directly in the browser.

import { detectZone } from "./time.js";

const KEY = "mortality";

// Colors the user can customise. Each maps to a CSS custom property (--<key>).
export const THEME_KEYS = ["bg", "label", "count", "accent"];

// Counter display units, cycled by clicking the number.
export const MODES = [
  "years",
  "calendar",
  "days",
  "weeks",
  "yearsLeft",
  "daysLeft",
  "weeksLeft",
];

// Curated full-theme presets. Every set is contrast-checked (count & label ≥4.5:1
// on bg, accent ≥3:1). Applying one writes all four THEME_KEYS at once.
export const PRESETS = {
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
  mode: "years",
};

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
 * Load persisted state, applying defaults and migrating older localStorage data
 * (the "mortality" JSON blob or the legacy "dob" string) on first run. Records
 * that predate timezone support get their birthZone backfilled with the
 * detected zone (see backfillZone) so the birth instant is anchored going
 * forward without changing the age shown today.
 * @returns {Promise<{ version: number, birth: string|null, birthZone: string|null, theme: Record<string,string>|null, expectancy: number, mode: string }>}
 */
export async function load() {
  let stored;
  try {
    stored = (await storage.get(KEY))[KEY];
  } catch {
    stored = null;
  }

  if (!stored) {
    const legacy = readLegacy();
    if (legacy) {
      const migrated = backfillZone({ ...DEFAULTS, ...legacy });
      await save(migrated);
      // Only clear localStorage when a real extension store now owns the data;
      // under the localStorage shim, KEY *is* the store we just wrote to.
      if (hasExtStorage) clearLegacy();
      return migrated;
    }
  }

  const state = { ...DEFAULTS, ...(stored || {}) };
  const backfilled = backfillZone(state);
  if (backfilled !== state) await save(backfilled);
  return backfilled;
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

/** Pick black or white ink for legible text on top of an accent fill. */
export function bestOnColor(hex) {
  return contrast("#ffffff", hex) >= contrast("#141414", hex)
    ? "#ffffff"
    : "#141414";
}

/**
 * Apply user colour overrides as inline custom properties (they win over the
 * stylesheet's light/dark defaults). Pass null to clear and follow the system.
 * Also derives --on-accent from the effective accent so button text stays
 * legible for any accent the user (or a preset) picks.
 */
export function applyTheme(theme) {
  const root = document.documentElement.style;
  THEME_KEYS.forEach((key) => {
    if (theme && theme[key]) root.setProperty(`--${key}`, theme[key]);
    else root.removeProperty(`--${key}`);
  });
  root.setProperty("--on-accent", bestOnColor(cssDefault("accent")));
}
