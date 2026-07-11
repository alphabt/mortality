// Dependency-free localization for extension pages and ordinary HTTP previews.

export const EN_MESSAGES = {
  extName: "Mortality",
  extDescription: "Replace new tab page with a counter of your age",
  pageTitle: "Mortality — New Tab",
  setupTitle: "When were you born?",
  setupSubtitle: "Your age, counting up live on every new tab.",
  birthDateAria: "Date of birth",
  birthTimeAria: "Time of birth (optional)",
  start: "Start",
  timeHint: "Time is optional — it sharpens the live count.",
  futureDateError: "That date is in the future — please check your birthday.",
  birthplaceLabel: "Where were you born?",
  birthplaceHint:
    "Defaults to your current time zone. Set it to where you were born so your age stays exact if you move.",
  searchTimeZones: "Search time zones",
  noTimeZones: "No matching time zones",
  actuarialBaseline: "Life expectancy data source",
  baselineSetupHint:
    "World data by default. Your time zone never changes this choice.",
  baseline: "Data source",
  lifeTableWorld: "World — UN 2023",
  lifeTableUS: "United States — SSA 2023",
  lifeTableCountry: "$COUNTRY$ — UN 2023",
  searchCountriesAreas: "Search countries and areas",
  noCountriesAreas: "No matching countries or areas",
  baselineSettingsHint:
    "Your time zone never changes the data source. Sex at birth is optional.",
  sexAtBirth: "Sex at birth",
  sexHint: "Optional — sharpens the life-expectancy estimate.",
  sexUnspecified: "Prefer not to say",
  sexFemale: "Female",
  sexMale: "Male",
  modeYears: "Age",
  modeCalendar: "Calendar age",
  modeBirthday: "Next birthday",
  modeDays: "Days lived",
  modeWeeks: "Weeks lived",
  modeYearsLeft: "Years left",
  modeDaysLeft: "Days left",
  modeWeeksLeft: "Weeks left",
  settings: "Settings",
  lifeInWeeks: "Life in weeks",
  changeUnits: "Change units",
  changeUnitsAction: "Activate to change units",
  changeUnitsTitle: "Click to change units",
  counterAria: "$LABEL$ $VALUE$. $ACTION$.",
  born: "Born $DATE$",
  birthdayCountdown: "in $COUNTDOWN$",
  progressCaption: "$PERCENT$ of $YEARS$ yrs lived",
  reflectionLine:
    "$LIVED$ years behind you · $AHEAD$ ahead, if the tables hold.",
  sectionPresets: "Presets",
  presetHint: "A preset sets all four colors at once.",
  sectionColors: "Colors",
  colorBackground: "Background",
  colorLabel: "Label",
  colorCounter: "Counter",
  colorAccent: "Accent",
  sectionDisplay: "Display",
  language: "Language",
  languageAutomatic: "Browser default",
  numerals: "Numerals",
  typefaceSystem: "System",
  typefaceGrotesk: "Grotesk",
  typefaceMono: "Mono",
  reflectionToggle: "Reflection line under the counter",
  sectionLifeExpectancy: "Life expectancy",
  source: "Source",
  sourceEstimate: "Estimate",
  sourceCustom: "Custom",
  estimateLine: "≈ $YEARS$ years — based on your age and selected data.",
  estimateMissing: "Add your birthday to see an estimate.",
  years: "Years",
  sectionTimeZone: "Time zone",
  bornIn: "Born in",
  zoneHint:
    "Anchors your birthday to a fixed instant, so your age stays exact when you travel.",
  sectionData: "Data",
  exportData: "Export…",
  importData: "Import…",
  importError: "Import failed. Choose a Mortality settings file.",
  sectionDeviceSync: "Device sync",
  syncPreferences: "Sync preferences across devices",
  syncPreferencesHint:
    "Syncs your theme, numeral style, reflection line, language, and counter mode through your browser account.",
  syncProfile: "Also sync birthday and life-expectancy details",
  syncProfileHint:
    "Also syncs your birth date and time, birth time zone, sex at birth, and selected life-expectancy data source or custom years. This information is more personal.",
  syncStatusOff: "Off",
  syncStatusSyncing: "Syncing…",
  syncStatusSynced: "Synced",
  syncStatusError: "Saved on this device. Sync couldn't update.",
  syncStatusUnavailable: "Device sync isn't available in this browser.",
  retrySync: "Retry sync",
  changeBirthday: "Change birthday",
  resetColors: "Reset colors",
  done: "Done",
  lowContrast:
    "Low contrast ($RATIO$:1). Aim for $TARGET$:1 on the background.",
  presetLight: "Light",
  presetDark: "Dark",
  presetPaper: "Paper",
  presetVoid: "Void",
  presetTerminal: "Terminal",
  presetBlueprint: "Blueprint",
  presetAmber: "Amber",
  themeAria: "$THEME$ theme",
  back: "Back",
  weeksSummary: "$LIVED$ weeks lived · $AHEAD$ ahead · $YEARS$ yrs",
  legendLived: "Lived",
  legendThisWeek: "This week",
  legendAhead: "Ahead",
};

const PLACEHOLDERS = {
  counterAria: { LABEL: 0, VALUE: 1, ACTION: 2 },
  born: { DATE: 0 },
  birthdayCountdown: { COUNTDOWN: 0 },
  progressCaption: { PERCENT: 0, YEARS: 1 },
  reflectionLine: { LIVED: 0, AHEAD: 1 },
  estimateLine: { YEARS: 0 },
  lowContrast: { RATIO: 0, TARGET: 1 },
  themeAria: { THEME: 0 },
  weeksSummary: { LIVED: 0, AHEAD: 1, YEARS: 2 },
  lifeTableCountry: { COUNTRY: 0 },
};

export const AUTOMATIC_LANGUAGE = "auto";

// Chrome's complete supported WebExtension locale set. Locale catalogs use
// underscores on disk, while Intl expects BCP 47 hyphens.
export const SUPPORTED_LANGUAGES = [
  "am",
  "ar",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en_AU",
  "en_GB",
  "en_US",
  "es",
  "es_419",
  "et",
  "fa",
  "fi",
  "fil",
  "fr",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "kn",
  "ko",
  "lt",
  "lv",
  "ml",
  "mr",
  "ms",
  "nl",
  "no",
  "pl",
  "pt_BR",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh_CN",
  "zh_TW",
];

let activeLocale = null;
let activeCatalog = null;
let activationRequest = 0;
const catalogCache = new Map();
const collatorCache = new Map();
const displayNamesCache = new Map();

function extensionI18n() {
  return globalThis.browser?.i18n ?? globalThis.chrome?.i18n ?? null;
}

function substitutionValues(substitutions) {
  return Array.isArray(substitutions)
    ? substitutions
    : substitutions == null
      ? []
      : [substitutions];
}

function substituteFallback(key, substitutions) {
  const values = substitutionValues(substitutions);
  const placeholders = PLACEHOLDERS[key] ?? {};
  return EN_MESSAGES[key].replace(/\$([A-Z][A-Z0-9_]*)\$/g, (token, name) => {
    const index = placeholders[name];
    return index == null ? token : String(values[index] ?? "");
  });
}

function substituteCatalog(entry, substitutions) {
  const values = substitutionValues(substitutions);
  const placeholders = entry.placeholders ?? {};
  return entry.message.replace(
    /\$([A-Z][A-Z0-9_]*)\$/gi,
    (token, placeholderName) => {
      const content = placeholders[placeholderName.toLowerCase()]?.content;
      const match = typeof content === "string" && content.match(/^\$(\d+)$/);
      return match ? String(values[Number(match[1]) - 1] ?? "") : token;
    },
  );
}

export function msg(key, substitutions) {
  if (activeCatalog) {
    const entry = activeCatalog[key];
    if (entry?.message) return substituteCatalog(entry, substitutions);
    return EN_MESSAGES[key] ? substituteFallback(key, substitutions) : "";
  }
  const api = extensionI18n();
  if (api?.getMessage) {
    const localized = api.getMessage(key, substitutions);
    if (localized) return localized;
  }
  return EN_MESSAGES[key] ? substituteFallback(key, substitutions) : "";
}

function canonicalLocale(value) {
  const normalized = String(value || "").replaceAll("_", "-");
  try {
    return Intl.getCanonicalLocales(normalized)[0] || null;
  } catch {
    return null;
  }
}

function validLocale(value) {
  return canonicalLocale(value) || "en";
}

const LANGUAGE_BY_LOCALE = new Map(
  SUPPORTED_LANGUAGES.map((language) => [
    validLocale(language).toLowerCase(),
    language,
  ]),
);

export function normalizeLanguage(value) {
  if (!value || value === AUTOMATIC_LANGUAGE) return AUTOMATIC_LANGUAGE;
  const locale = canonicalLocale(value);
  return locale
    ? LANGUAGE_BY_LOCALE.get(locale.toLowerCase()) || AUTOMATIC_LANGUAGE
    : AUTOMATIC_LANGUAGE;
}

export function languageName(language) {
  const locale = validLocale(language);
  try {
    return (
      new Intl.DisplayNames([locale], { type: "language" }).of(locale) || locale
    );
  } catch {
    return locale;
  }
}

/** Localized region name, retaining the official UN English name as fallback. */
export function regionName(iso2, fallback) {
  const code =
    typeof iso2 === "string" && /^[A-Z]{2}$/.test(iso2) ? iso2 : null;
  if (!code) return fallback;
  const locale = getLocale();
  try {
    if (!displayNamesCache.has(locale)) {
      displayNamesCache.set(
        locale,
        new Intl.DisplayNames([locale], { type: "region" }),
      );
    }
    const localized = displayNamesCache.get(locale).of(code);
    return localized && localized.toUpperCase() !== code ? localized : fallback;
  } catch {
    return fallback;
  }
}

/** Compare display labels with the currently active locale's collation rules. */
export function compareLocaleText(left, right) {
  const locale = getLocale();
  try {
    if (!collatorCache.has(locale)) {
      collatorCache.set(
        locale,
        new Intl.Collator(locale, {
          usage: "sort",
          sensitivity: "base",
          numeric: true,
        }),
      );
    }
    return collatorCache.get(locale).compare(left, right);
  } catch {
    return String(left).localeCompare(String(right), "en", {
      sensitivity: "base",
      numeric: true,
    });
  }
}

async function loadCatalog(language) {
  if (!catalogCache.has(language)) {
    catalogCache.set(
      language,
      (async () => {
        const response = await fetch(
          new URL(`./_locales/${language}/messages.json`, import.meta.url),
        );
        if (!response.ok) {
          throw new Error(
            `Could not load ${language} translations (${response.status})`,
          );
        }
        const catalog = await response.json();
        if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
          throw new TypeError(`Invalid ${language} translation catalog`);
        }
        return catalog;
      })(),
    );
  }
  try {
    return await catalogCache.get(language);
  } catch (error) {
    catalogCache.delete(language);
    throw error;
  }
}

/**
 * Activate a bundled locale, or return to the browser's locale with "auto".
 * Returns null when a newer activation supersedes this request.
 */
export async function activateLanguage(value) {
  const request = ++activationRequest;
  const language = normalizeLanguage(value);
  if (language === AUTOMATIC_LANGUAGE) {
    activeLocale = null;
    activeCatalog = null;
    return language;
  }

  const catalog = await loadCatalog(language);
  if (request !== activationRequest) return null;
  activeLocale = validLocale(language);
  activeCatalog = catalog;
  return language;
}

export function getLocale() {
  if (activeLocale) return activeLocale;
  const api = extensionI18n();
  let locale = api?.getUILanguage?.() || api?.getMessage?.("@@ui_locale");
  if (!locale) locale = globalThis.navigator?.language || "en";
  return validLocale(locale);
}

export function getDirection() {
  if (activeLocale) {
    return /^(ar|fa|he)(-|$)/i.test(activeLocale) ? "rtl" : "ltr";
  }
  const apiDirection = extensionI18n()?.getMessage?.("@@bidi_dir");
  if (apiDirection === "rtl" || apiDirection === "ltr") return apiDirection;
  return /^(ar|fa|he)(-|$)/i.test(getLocale()) ? "rtl" : "ltr";
}

export function applyDocumentLocale() {
  if (!globalThis.document) return;
  document.documentElement.lang = getLocale();
  document.documentElement.dir = getDirection();
  document.title = msg("pageTitle");
}

function formatter(factory, options, fallbackLocale = "en") {
  const locale = getLocale();
  // Chromium reports the generic `ar` locale for the official extension
  // catalog. Pin its native numbering system rather than accepting a host ICU
  // build that resolves generic Arabic to Latin digits.
  const intlLocale = locale === "ar" ? "ar-u-nu-arab" : locale;
  try {
    return new factory(intlLocale, options);
  } catch {
    return new factory(fallbackLocale, options);
  }
}

export function formatNumber(value, options = {}) {
  return formatter(Intl.NumberFormat, options).format(value);
}

export function formatFixedParts(value, digits = 9) {
  const parts = formatter(Intl.NumberFormat, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).formatToParts(value);
  const integer = parts
    .filter((part) => part.type === "integer" || part.type === "group")
    .map((part) => part.value)
    .join("");
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const fraction = parts.find((part) => part.type === "fraction")?.value ?? "";
  return {
    integer,
    decimal,
    fraction,
    text: parts.map((part) => part.value).join(""),
  };
}

export function formatPercent(value, options = {}) {
  return formatter(Intl.NumberFormat, {
    style: "percent",
    maximumFractionDigits: 0,
    ...options,
  }).format(value);
}

export function formatDate(date, options = {}) {
  return formatter(Intl.DateTimeFormat, options).format(date);
}

export function formatList(values, options = {}) {
  if (typeof Intl.ListFormat === "function") {
    return formatter(Intl.ListFormat, {
      style: "long",
      type: "conjunction",
      ...options,
    }).format(values);
  }
  return values.join(", ");
}

export function formatUnit(value, unit, options = {}) {
  try {
    return formatter(Intl.NumberFormat, {
      style: "unit",
      unit,
      unitDisplay: "long",
      ...options,
    }).format(value);
  } catch {
    return `${formatNumber(value, options)} ${unit}`;
  }
}

export function formatUnitParts(value, unit, options = {}) {
  try {
    // ICU's Japanese "narrow" year is the English-looking `y`; "short" is the
    // equally compact native 年 form expected by a localized instrument face.
    const unitDisplay =
      options.unitDisplay ??
      (getLocale().startsWith("ja") ? "short" : "narrow");
    return formatter(Intl.NumberFormat, {
      style: "unit",
      unit,
      unitDisplay,
      ...options,
    }).formatToParts(value);
  } catch {
    return [
      { type: "integer", value: formatNumber(value, options) },
      { type: "literal", value: " " },
      { type: "unit", value: unit },
    ];
  }
}
