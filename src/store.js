// Persistence + theming. No dependencies, runs directly in the browser.

const KEY = "mortality";

// Colors the user can customise. Each maps to a CSS custom property (--<key>).
export const THEME_KEYS = ["bg", "label", "count", "accent"];

// Counter display units, cycled by clicking the number.
export const MODES = ["years", "days", "weeks", "weeksLeft"];

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
  theme: null,
  expectancy: 80,
  mode: "years",
};

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

function contrast(a, b) {
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
