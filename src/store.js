// Persistence + theming. No dependencies, runs directly in the browser.

const KEY = "mortality";

// Colors the user can customise. Each maps to a CSS custom property (--<key>).
export const THEME_KEYS = ["bg", "label", "count", "accent"];

const DEFAULTS = { version: 1, birth: null, theme: null };

// Extension storage.local persists across the privacy/history clearing that can
// silently wipe localStorage on extension pages (Firefox especially, issue #16).
// Promise-based in Firefox (browser.*) and Chrome/Edge MV3 (chrome.*, 88+).
const storage = (globalThis.browser ?? globalThis.chrome).storage.local;

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
 * Load persisted state, applying defaults and migrating older localStorage data
 * (the "mortality" JSON blob or the legacy "dob" string) on first run.
 * @returns {Promise<{ version: number, birth: string|null, theme: Record<string,string>|null }>}
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
      const migrated = { ...DEFAULTS, ...legacy };
      await save(migrated);
      clearLegacy();
      return migrated;
    }
  }

  return { ...DEFAULTS, ...(stored || {}) };
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

/**
 * Apply user colour overrides as inline custom properties (they win over the
 * stylesheet's light/dark defaults). Pass null to clear and follow the system.
 */
export function applyTheme(theme) {
  const root = document.documentElement.style;
  THEME_KEYS.forEach((key) => {
    if (theme && theme[key]) root.setProperty(`--${key}`, theme[key]);
    else root.removeProperty(`--${key}`);
  });
}
