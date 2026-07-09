// Persistence + theming. No dependencies, runs directly in the browser.

const KEY = "mortality";

// Colors the user can customise. Each maps to a CSS custom property (--<key>).
export const THEME_KEYS = ["bg", "label", "count", "accent"];

const DEFAULTS = { version: 1, birth: null, theme: null };

/**
 * Load persisted state, applying defaults and migrating legacy (v1.2) storage.
 * @returns {{ version: number, birth: string|null, theme: Record<string,string>|null }}
 */
export function load() {
  let state;
  try {
    state = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    state = { ...DEFAULTS };
  }
  // Migrate the old published format (localStorage.dob = "YYYY-MM-DD").
  if (!state.birth && localStorage.dob) {
    state.birth = localStorage.dob;
    save(state);
  }
  return state;
}

/** Persist state. */
export function save(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
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
