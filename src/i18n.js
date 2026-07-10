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
  numerals: "Numerals",
  typefaceSystem: "System",
  typefaceGrotesk: "Grotesk",
  typefaceMono: "Mono",
  reflectionToggle: "Reflection line under the counter",
  sectionLifeExpectancy: "Life expectancy",
  source: "Source",
  sourceEstimate: "Estimate",
  sourceCustom: "Custom",
  estimateLine: "≈ $YEARS$ years — actuarial estimate for your age.",
  estimateMissing: "Add your birthday to see an actuarial estimate.",
  years: "Years",
  sectionTimeZone: "Time zone",
  bornIn: "Born in",
  zoneHint:
    "Anchors your birthday to a fixed instant, so your age stays exact when you travel.",
  sectionData: "Data",
  exportData: "Export…",
  importData: "Import…",
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
};

function extensionI18n() {
  return globalThis.browser?.i18n ?? globalThis.chrome?.i18n ?? null;
}

function substituteFallback(key, substitutions) {
  const values = Array.isArray(substitutions)
    ? substitutions
    : substitutions == null
      ? []
      : [substitutions];
  const placeholders = PLACEHOLDERS[key] ?? {};
  return EN_MESSAGES[key].replace(/\$([A-Z][A-Z0-9_]*)\$/g, (token, name) => {
    const index = placeholders[name];
    return index == null ? token : String(values[index] ?? "");
  });
}

export function msg(key, substitutions) {
  const api = extensionI18n();
  if (api?.getMessage) {
    const localized = api.getMessage(key, substitutions);
    if (localized) return localized;
  }
  return EN_MESSAGES[key] ? substituteFallback(key, substitutions) : "";
}

function validLocale(value) {
  const normalized = String(value || "en").replaceAll("_", "-");
  try {
    return Intl.getCanonicalLocales(normalized)[0] || "en";
  } catch {
    return "en";
  }
}

export function getLocale() {
  const api = extensionI18n();
  let locale = api?.getUILanguage?.() || api?.getMessage?.("@@ui_locale");
  if (!locale) locale = globalThis.navigator?.language || "en";
  return validLocale(locale);
}

export function getDirection() {
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
