// Pure render functions for each screen. They build DOM and wire events to the
// callbacks provided by the controller (tab.js).

import {
  THEME_KEYS,
  cssDefault,
  PRESETS,
  contrast,
  bestOnColor,
} from "./store.js";
import { listTimeZones, detectZone } from "./time.js";
import {
  DEFAULT_LIFE_TABLE,
  LIFE_TABLE_OPTIONS,
  normalizeLifeTable,
} from "./lifetable.js";
import { el } from "./dom.js";
import {
  AUTOMATIC_LANGUAGE,
  SUPPORTED_LANGUAGES,
  formatNumber,
  languageName,
  msg,
  normalizeLanguage,
} from "./i18n.js";

const COLOR_LABELS = {
  bg: "colorBackground",
  label: "colorLabel",
  count: "colorCounter",
  accent: "colorAccent",
};

// Numeral typeface choices for the Display segmented control:
// [value, button label, optional class that previews the font on the button].
const TYPEFACE_OPTIONS = [
  ["system", "typefaceSystem", null],
  ["grotesk", "typefaceGrotesk", "grotesk"],
  ["mono", "typefaceMono", "mono"],
];

const PRESET_LABELS = {
  Light: "presetLight",
  Dark: "presetDark",
  Paper: "presetPaper",
  Void: "presetVoid",
  Terminal: "presetTerminal",
  Blueprint: "presetBlueprint",
  Amber: "presetAmber",
};

// Guarded colours and their minimum WCAG contrast ratio against the background.
const CONTRAST_MIN = { count: 4.5, label: 4.5, accent: 3 };

const SVG_NS = "http://www.w3.org/2000/svg";

/** Build an SVG node. el() uses createElement (HTML only), so icons need this. */
function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child != null) node.appendChild(child);
  }
  return node;
}

/** A crisp, monochrome gear that inherits the button's currentColor. */
function gearIcon() {
  const line = { stroke: "currentColor", "stroke-width": "1.6" };
  const teeth = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return svgEl("line", {
      x1: (12 + Math.cos(a) * 7).toFixed(2),
      y1: (12 + Math.sin(a) * 7).toFixed(2),
      x2: (12 + Math.cos(a) * 9.3).toFixed(2),
      y2: (12 + Math.sin(a) * 9.3).toFixed(2),
      "stroke-linecap": "round",
      ...line,
    });
  });
  return svgEl(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: "22",
      height: "22",
      fill: "none",
      "aria-hidden": "true",
      focusable: "false",
    },
    [
      svgEl("circle", { cx: "12", cy: "12", r: "6.4", ...line }),
      svgEl("circle", { cx: "12", cy: "12", r: "2.4", ...line }),
      ...teeth,
    ],
  );
}

// Sex-at-birth choices, shared by setup and settings. The empty value is the
// privacy-respecting default and maps to `null` (no sex shared) at the boundary.
const SEX_OPTIONS = [
  ["", "sexUnspecified"],
  ["female", "sexFemale"],
  ["male", "sexMale"],
];

/** A sex-at-birth <select>, pre-selecting `current` ("male"/"female"/null). */
function sexSelect(id, current) {
  const select = el(
    "select",
    { id },
    SEX_OPTIONS.map(([value, label]) => el("option", { value }, msg(label))),
  );
  select.value = current === "male" || current === "female" ? current : "";
  return select;
}

/** An explicit actuarial-baseline picker; never inferred from time zone. */
function lifeTableSelect(id, current) {
  const select = el(
    "select",
    { id },
    LIFE_TABLE_OPTIONS.map(({ value, messageKey }) =>
      el("option", { value }, msg(messageKey)),
    ),
  );
  select.value = normalizeLifeTable(current || DEFAULT_LIFE_TABLE);
  return select;
}

/** A language picker whose choices identify themselves in their own language. */
function languageSelect(id, current) {
  const select = el("select", { id }, [
    el("option", { value: AUTOMATIC_LANGUAGE }, msg("languageAutomatic")),
    ...SUPPORTED_LANGUAGES.map((language) => {
      const locale = language.replaceAll("_", "-");
      return el(
        "option",
        {
          value: language,
          lang: locale,
          dir: /^(ar|fa|he)(-|$)/i.test(locale) ? "rtl" : "ltr",
        },
        languageName(language),
      );
    }),
  ]);
  select.value = normalizeLanguage(current);
  return select;
}

/** Today as YYYY-MM-DD in local time, used to cap the birth-date field. */
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/** Split a stored birth ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm") into [date, time]. */
function splitBirth(value) {
  const [date, time = ""] = value.split("T");
  return [date, time.slice(0, 5)];
}

/** Birthday entry screen. Stored values pre-fill when editing. */
export function renderSetup(
  app,
  { start, setLanguage },
  current,
  savedZone,
  savedSex,
  savedLifeTable,
  savedLanguage,
) {
  const dateEl = el("input", {
    type: "date",
    id: "birth-date",
    "aria-label": msg("birthDateAria"),
    autocomplete: "bday",
    max: todayISO(),
    required: true,
  });
  const timeEl = el("input", {
    type: "time",
    id: "birth-time",
    "aria-label": msg("birthTimeAria"),
  });
  const detected = detectZone();
  const selectedZone = savedZone || detected;
  const zoneEl = el(
    "select",
    { id: "birth-zone", class: "bidi-id" },
    listTimeZones(selectedZone, detected).map((zone) =>
      el("option", { value: zone }, zone),
    ),
  );
  zoneEl.value = selectedZone;
  const sexEl = sexSelect("birth-sex", savedSex);
  const lifeTableEl = lifeTableSelect("birth-life-table", savedLifeTable);
  const languageEl = languageSelect("setup-language", savedLanguage);
  const startBtn = el("button", { id: "start" }, msg("start"));
  const errorEl = el("p", {
    class: "field-error",
    id: "birth-error",
    role: "alert",
    hidden: true,
  });
  const form = el("form", {}, [
    el("h1", { class: "screen-title" }, msg("setupTitle")),
    el("p", { class: "screen-subtitle" }, msg("setupSubtitle")),
    el("div", { class: "setup-field setup-language" }, [
      el(
        "label",
        { class: "setup-label", for: "setup-language" },
        msg("language"),
      ),
      languageEl,
    ]),
    el("div", { class: "setup-row" }, [dateEl, timeEl]),
    errorEl,
    el("p", { class: "hint setup-hint" }, msg("timeHint")),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "birth-zone" },
        msg("birthplaceLabel"),
      ),
      zoneEl,
      el("p", { class: "hint" }, msg("birthplaceHint")),
    ]),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "birth-life-table" },
        msg("actuarialBaseline"),
      ),
      lifeTableEl,
      el("p", { class: "hint" }, msg("baselineSetupHint")),
    ]),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "birth-sex" },
        msg("sexAtBirth"),
      ),
      sexEl,
      el("p", { class: "hint" }, msg("sexHint")),
    ]),
    el("footer", {}, [startBtn]),
  ]);
  app.replaceChildren(form);

  if (current) {
    const [date, time] = splitBirth(current);
    dateEl.value = date;
    if (time) timeEl.value = time;
  }
  function submitBirth() {
    if (!dateEl.value) {
      dateEl.reportValidity();
      return;
    }
    const birth = `${dateEl.value}T${timeEl.value || "00:00"}`;
    if (new Date(birth).getTime() > Date.now()) {
      errorEl.textContent = msg("futureDateError");
      errorEl.hidden = false;
      dateEl.focus();
      return;
    }
    errorEl.hidden = true;
    start(birth, zoneEl.value, sexEl.value || null, lifeTableEl.value);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitBirth();
  });
  [dateEl, timeEl].forEach((input) =>
    input.addEventListener("input", () => {
      errorEl.hidden = true;
    }),
  );
  languageEl.addEventListener("change", () => {
    const birth = dateEl.value
      ? `${dateEl.value}T${timeEl.value || "00:00"}`
      : null;
    setLanguage(languageEl.value, {
      birth,
      birthZone: zoneEl.value,
      sex: sexEl.value || null,
      lifeTable: lifeTableEl.value,
    });
  });
  [dateEl, timeEl, zoneEl, lifeTableEl, sexEl].forEach((input) =>
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitBirth();
      }
    }),
  );
  dateEl.focus();
}

/** Live age counter. Returns the elements the ticker updates. */
export function renderCounter(
  app,
  { openSettings, onCycle, openWeeks },
  { born, reflection },
) {
  const gear = el(
    "button",
    {
      class: "gear",
      id: "gear",
      title: msg("settings"),
      "aria-label": msg("settings"),
    },
    gearIcon(),
  );
  const weeksBtn = el(
    "button",
    {
      class: "gear",
      id: "weeks-btn",
      title: msg("lifeInWeeks"),
      "aria-label": msg("lifeInWeeks"),
    },
    "\u25a6",
  );
  const label = el(
    "h1",
    { class: "age-label", id: "unit-label" },
    msg("modeYears"),
  );
  const count = el("p", {
    class: "count",
    id: "count",
    role: "button",
    tabindex: "0",
    "aria-label": msg("changeUnits"),
    title: msg("changeUnitsTitle"),
  });
  const progressFill = el("span", {
    class: "progress-fill",
    id: "progress-fill",
  });
  const pct = el("span", { class: "pct", id: "pct" });
  const unitHint = el(
    "p",
    { class: "unit-hint", "aria-hidden": "true" },
    msg("changeUnitsTitle"),
  );
  const counter = el("div", { class: "counter" }, [
    label,
    count,
    unitHint,
    el("div", { class: "meta" }, [
      el("div", { class: "progress", "aria-hidden": "true" }, progressFill),
      el("div", { class: "meta-row" }, [
        el("span", { class: "born" }, born),
        pct,
      ]),
    ]),
  ]);
  // An optional editorial line under the meter, on only when the user asks for it.
  if (reflection) {
    counter.append(el("p", { class: "reflection" }, reflection));
  }
  // Both chrome controls share one top-right cluster so the rest of the canvas
  // (and the whole top-left) stays clear — the gear keeps the corner, the
  // life-in-weeks toggle sits just inboard of it.
  const cornerControls = el("div", { class: "corner-controls" }, [
    weeksBtn,
    gear,
  ]);
  app.replaceChildren(cornerControls, counter);

  gear.addEventListener("click", openSettings);
  weeksBtn.addEventListener("click", openWeeks);
  count.addEventListener("click", onCycle);
  count.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCycle();
    }
  });
  return { label, count, progressFill, pct };
}

/** Settings screen: presets + colour pickers + life expectancy + resets. */
export function renderSettings(
  app,
  actions,
  {
    theme,
    expectancy,
    expectancySource,
    sex,
    lifeTable,
    estimate,
    typeface,
    reflection,
    birthZone,
    language,
  },
) {
  const colorInputs = {};
  const notes = {};
  const languageEl = languageSelect("settings-language", language);
  languageEl.addEventListener("change", () =>
    actions.setLanguage(languageEl.value),
  );
  const rows = THEME_KEYS.flatMap((key) => {
    const attrs = {
      type: "color",
      id: `color-${key}`,
      value: (theme && theme[key]) || cssDefault(key),
    };
    if (CONTRAST_MIN[key]) attrs["aria-describedby"] = `warn-${key}`;
    const input = el("input", attrs);
    colorInputs[key] = input;
    const row = el("div", { class: "row" }, [
      el("label", { for: `color-${key}` }, msg(COLOR_LABELS[key])),
      input,
    ]);
    if (!CONTRAST_MIN[key]) return [row];
    const note = el("p", {
      class: "contrast-note",
      id: `warn-${key}`,
      role: "status",
      hidden: true,
    });
    notes[key] = note;
    return [row, note];
  });

  const swatches = Object.entries(PRESETS).map(([name, preset]) => {
    const displayName = msg(PRESET_LABELS[name]);
    return el(
      "button",
      {
        type: "button",
        class: "preset",
        "data-preset": name,
        title: displayName,
        "aria-label": msg("themeAria", displayName),
        style: `background:${preset.bg}`,
      },
      [
        el("i", { style: `background:${preset.count}` }),
        el("i", { style: `background:${preset.accent}` }),
      ],
    );
  });

  const expectancyInput = el("input", {
    type: "number",
    id: "expectancy",
    min: "1",
    max: "150",
    step: "1",
    value: expectancy,
  });

  // Life expectancy: choose between an age-based actuarial estimate and a manual
  // number. In "estimate" mode the manual input is hidden and a read-only line
  // previews the figure in force; "custom" restores the editable Years input.
  const useEstimate = expectancySource !== "custom";
  const sourceButtons = [
    ["estimate", "sourceEstimate"],
    ["custom", "sourceCustom"],
  ].map(([value, text]) => {
    const btn = el(
      "button",
      {
        type: "button",
        "data-source": value,
        "aria-pressed": String(useEstimate === (value === "estimate")),
      },
      msg(text),
    );
    btn.addEventListener("click", () => actions.setExpectancySource(value));
    return btn;
  });
  const sourceSegment = el(
    "div",
    {
      class: "segment",
      role: "group",
      "aria-labelledby": "expectancy-source-label",
    },
    sourceButtons,
  );
  const estimateLine = el(
    "p",
    { class: "settings-hint", id: "expectancy-estimate" },
    estimate != null
      ? msg("estimateLine", formatNumber(estimate))
      : msg("estimateMissing"),
  );
  const customRow = el("div", { class: "row" }, [
    el("label", { for: "expectancy" }, msg("years")),
    expectancyInput,
  ]);
  const lifeTableEl = lifeTableSelect("settings-life-table", lifeTable);
  lifeTableEl.addEventListener("change", () =>
    actions.setLifeTable(lifeTableEl.value),
  );
  const lifeTableRow = el("div", { class: "row" }, [
    el("label", { for: "settings-life-table" }, msg("baseline")),
    lifeTableEl,
  ]);
  const sexEl = sexSelect("settings-sex", sex);
  sexEl.addEventListener("change", () => actions.setSex(sexEl.value || null));
  const sexRow = el("div", { class: "row" }, [
    el("label", { for: "settings-sex" }, msg("sexAtBirth")),
    sexEl,
  ]);

  // Display: numeral typeface (segmented control) + reflection-line toggle.
  const numeralsLabel = el("label", { id: "numerals-label" }, msg("numerals"));
  const typefaceButtons = TYPEFACE_OPTIONS.map(([value, text, cls]) => {
    const btn = el(
      "button",
      {
        type: "button",
        class: cls,
        "data-typeface": value,
        "aria-pressed": String(typeface === value),
      },
      msg(text),
    );
    btn.addEventListener("click", () => actions.setTypeface(value));
    return btn;
  });
  const typefaceSegment = el(
    "div",
    { class: "segment", role: "group", "aria-labelledby": "numerals-label" },
    typefaceButtons,
  );
  const reflectionSwitch = el("button", {
    type: "button",
    class: "switch",
    id: "reflection-switch",
    role: "switch",
    "aria-checked": String(Boolean(reflection)),
  });
  reflectionSwitch.addEventListener("click", actions.toggleReflection);

  // Time zone: re-anchor the birth instant to a different zone after setup.
  const detected = detectZone();
  const selectedZone = birthZone || detected;
  const zoneSelect = el(
    "select",
    { id: "settings-zone", class: "bidi-id" },
    listTimeZones(selectedZone, detected).map((zone) =>
      el("option", { value: zone }, zone),
    ),
  );
  zoneSelect.value = selectedZone;
  zoneSelect.addEventListener("change", (event) =>
    actions.setZone(event.target.value),
  );

  // Data: export the whole state as JSON, or import a previously saved file.
  const exportBtn = el(
    "button",
    { type: "button", id: "export-data", class: "btn-secondary" },
    msg("exportData"),
  );
  const importBtn = el(
    "button",
    { type: "button", id: "import-data", class: "btn-secondary" },
    msg("importData"),
  );
  exportBtn.addEventListener("click", actions.exportData);
  importBtn.addEventListener("click", actions.importData);

  const resetBirthdayBtn = el(
    "button",
    { id: "reset-birthday", class: "btn-secondary" },
    msg("changeBirthday"),
  );
  const resetColorsBtn = el(
    "button",
    { id: "reset-colors", class: "btn-secondary" },
    msg("resetColors"),
  );
  const doneBtn = el("button", { id: "done" }, msg("done"));

  const settings = el("div", { class: "settings" }, [
    el("h1", { class: "screen-title" }, msg("settings")),
    el("p", { class: "settings-label" }, msg("sectionPresets")),
    el("div", { class: "presets" }, swatches),
    el("p", { class: "settings-hint" }, msg("presetHint")),
    el("p", { class: "settings-label" }, msg("sectionColors")),
    ...rows,
    el("p", { class: "settings-label" }, msg("sectionDisplay")),
    el("div", { class: "row" }, [
      el("label", { for: "settings-language" }, msg("language")),
      languageEl,
    ]),
    el("div", { class: "row" }, [numeralsLabel, typefaceSegment]),
    el("div", { class: "row" }, [
      el("label", { for: "reflection-switch" }, msg("reflectionToggle")),
      reflectionSwitch,
    ]),
    el("p", { class: "settings-label" }, msg("sectionLifeExpectancy")),
    el("div", { class: "row" }, [
      el("label", { id: "expectancy-source-label" }, msg("source")),
      sourceSegment,
    ]),
    ...(useEstimate
      ? [
          lifeTableRow,
          estimateLine,
          sexRow,
          el("p", { class: "settings-hint" }, msg("baselineSettingsHint")),
        ]
      : [customRow]),
    el("p", { class: "settings-label" }, msg("sectionTimeZone")),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "settings-zone" },
        msg("bornIn"),
      ),
      zoneSelect,
      el("p", { class: "hint" }, msg("zoneHint")),
    ]),
    el("p", { class: "settings-label" }, msg("sectionData")),
    el("div", { class: "actions" }, [exportBtn, importBtn]),
    el("div", { class: "actions" }, [resetBirthdayBtn, resetColorsBtn]),
    el("div", { class: "actions" }, [doneBtn]),
  ]);
  app.replaceChildren(settings);

  function activePreset() {
    return (
      Object.keys(PRESETS).find((name) =>
        THEME_KEYS.every(
          (key) =>
            colorInputs[key].value.toLowerCase() ===
            PRESETS[name][key].toLowerCase(),
        ),
      ) || null
    );
  }
  function refreshActive() {
    const name = activePreset();
    swatches.forEach((btn) => {
      const on = btn.dataset.preset === name;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-pressed", String(on));
    });
  }
  function refreshWarnings() {
    const bg = colorInputs.bg.value;
    THEME_KEYS.forEach((key) => {
      const note = notes[key];
      if (!note) return;
      const ratio = contrast(colorInputs[key].value, bg);
      if (ratio < CONTRAST_MIN[key]) {
        note.textContent = msg("lowContrast", [
          formatNumber(ratio, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
          formatNumber(CONTRAST_MIN[key], {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        ]);
        note.style.color = bestOnColor(bg);
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    });
  }

  THEME_KEYS.forEach((key) => {
    colorInputs[key].addEventListener("input", (event) => {
      actions.setColor(key, event.target.value);
      refreshWarnings();
      refreshActive();
    });
  });
  swatches.forEach((btn) => {
    btn.addEventListener("click", () =>
      actions.applyPreset(btn.dataset.preset),
    );
  });
  expectancyInput.addEventListener("input", (event) =>
    actions.setExpectancy(event.target.value),
  );
  resetBirthdayBtn.addEventListener("click", actions.resetBirthday);
  resetColorsBtn.addEventListener("click", actions.resetColors);
  doneBtn.addEventListener("click", actions.closeSettings);

  refreshWarnings();
  refreshActive();
}

/**
 * Life-in-weeks grid: every row is a year of the expectancy, every cell a week —
 * lived weeks filled, the current week accented, the rest dim. Static per open;
 * the grid is decorative (aria-hidden) and the subtitle carries the real counts.
 */
export function renderWeeks(
  app,
  { back, openSettings },
  { born, lived, total, expectancy },
) {
  const backBtn = el(
    "button",
    {
      class: "gear",
      id: "weeks-back",
      title: msg("back"),
      "aria-label": msg("back"),
    },
    "\u2190",
  );
  const gear = el(
    "button",
    {
      class: "gear",
      id: "gear",
      title: msg("settings"),
      "aria-label": msg("settings"),
    },
    gearIcon(),
  );

  const grid = el("div", { class: "weeks-grid", "aria-hidden": "true" });
  const cells = document.createDocumentFragment();
  for (let i = 0; i < total; i++) {
    const cls = i < lived ? "lived" : i === lived ? "now" : "future";
    cells.append(el("i", { class: cls }));
  }
  grid.append(cells);

  const wrap = el("div", { class: "weeks-wrap" }, [
    el("div", { class: "weeks-head" }, [
      el("h1", { class: "age-label" }, msg("lifeInWeeks")),
      el(
        "p",
        { class: "hint" },
        msg("weeksSummary", [
          formatNumber(lived),
          formatNumber(total - lived),
          formatNumber(expectancy),
        ]),
      ),
    ]),
    grid,
    el("div", { class: "weeks-legend" }, [
      el("span", {}, [el("i", { class: "lived" }), msg("legendLived")]),
      el("span", {}, [el("i", { class: "now" }), msg("legendThisWeek")]),
      el("span", {}, [el("i", { class: "future" }), msg("legendAhead")]),
    ]),
  ]);

  // Same top-right cluster as the counter: the Back arrow takes the exact slot
  // the grid toggle used to enter this view, so you leave from where you came in.
  const cornerControls = el("div", { class: "corner-controls" }, [
    backBtn,
    gear,
  ]);
  app.replaceChildren(cornerControls, wrap);

  backBtn.addEventListener("click", back);
  gear.addEventListener("click", openSettings);
}
