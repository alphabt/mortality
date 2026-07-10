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

const COLOR_LABELS = {
  bg: "Background",
  label: "Label",
  count: "Counter",
  accent: "Accent",
};

// Numeral typeface choices for the Display segmented control:
// [value, button label, optional class that previews the font on the button].
const TYPEFACE_OPTIONS = [
  ["system", "System", null],
  ["grotesk", "Grotesk", "grotesk"],
  ["mono", "Mono", "mono"],
];

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
  ["", "Prefer not to say"],
  ["female", "Female"],
  ["male", "Male"],
];

/** A sex-at-birth <select>, pre-selecting `current` ("male"/"female"/null). */
function sexSelect(id, current) {
  const select = el(
    "select",
    { id },
    SEX_OPTIONS.map(([value, label]) => el("option", { value }, label)),
  );
  select.value = current === "male" || current === "female" ? current : "";
  return select;
}

/** An explicit actuarial-baseline picker; never inferred from time zone. */
function lifeTableSelect(id, current) {
  const select = el(
    "select",
    { id },
    LIFE_TABLE_OPTIONS.map(({ value, label }) =>
      el("option", { value }, label),
    ),
  );
  select.value = normalizeLifeTable(current || DEFAULT_LIFE_TABLE);
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
  { start },
  current,
  savedZone,
  savedSex,
  savedLifeTable,
) {
  const dateEl = el("input", {
    type: "date",
    id: "birth-date",
    "aria-label": "Date of birth",
    autocomplete: "bday",
    max: todayISO(),
    required: true,
  });
  const timeEl = el("input", {
    type: "time",
    id: "birth-time",
    "aria-label": "Time of birth (optional)",
  });
  const detected = detectZone();
  const selectedZone = savedZone || detected;
  const zoneEl = el(
    "select",
    { id: "birth-zone" },
    listTimeZones(selectedZone, detected).map((zone) =>
      el("option", { value: zone }, zone),
    ),
  );
  zoneEl.value = selectedZone;
  const sexEl = sexSelect("birth-sex", savedSex);
  const lifeTableEl = lifeTableSelect("birth-life-table", savedLifeTable);
  const startBtn = el("button", { id: "start" }, "Start");
  const errorEl = el("p", {
    class: "field-error",
    id: "birth-error",
    role: "alert",
    hidden: true,
  });
  const form = el("form", {}, [
    el("h1", { class: "screen-title" }, "When were you born?"),
    el(
      "p",
      { class: "screen-subtitle" },
      "Your age, counting up live on every new tab.",
    ),
    el("div", { class: "setup-row" }, [dateEl, timeEl]),
    errorEl,
    el(
      "p",
      { class: "hint setup-hint" },
      "Time is optional — it sharpens the live count.",
    ),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "birth-zone" },
        "Where were you born?",
      ),
      zoneEl,
      el(
        "p",
        { class: "hint" },
        "Defaults to your current time zone. Set it to where you were born so your age stays exact if you move.",
      ),
    ]),
    el("div", { class: "setup-field" }, [
      el(
        "label",
        { class: "setup-label", for: "birth-life-table" },
        "Actuarial baseline",
      ),
      lifeTableEl,
      el(
        "p",
        { class: "hint" },
        "World by default. Chosen explicitly — never inferred from your time zone.",
      ),
    ]),
    el("div", { class: "setup-field" }, [
      el("label", { class: "setup-label", for: "birth-sex" }, "Sex at birth"),
      sexEl,
      el(
        "p",
        { class: "hint" },
        "Optional — sharpens the life-expectancy estimate.",
      ),
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
      errorEl.textContent =
        "That date is in the future — please check your birthday.";
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
    { class: "gear", id: "gear", title: "Settings", "aria-label": "Settings" },
    gearIcon(),
  );
  const weeksBtn = el(
    "button",
    {
      class: "gear",
      id: "weeks-btn",
      title: "Life in weeks",
      "aria-label": "Life in weeks",
    },
    "\u25a6",
  );
  const label = el("h1", { class: "age-label", id: "unit-label" }, "Age");
  const count = el("p", {
    class: "count",
    id: "count",
    role: "button",
    tabindex: "0",
    "aria-label": "Change units",
    title: "Click to change units",
  });
  const progressFill = el("span", {
    class: "progress-fill",
    id: "progress-fill",
  });
  const pct = el("span", { class: "pct", id: "pct" });
  const unitHint = el(
    "p",
    { class: "unit-hint", "aria-hidden": "true" },
    "Click to change units",
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
  },
) {
  const colorInputs = {};
  const notes = {};
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
      el("label", { for: `color-${key}` }, COLOR_LABELS[key]),
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

  const swatches = Object.entries(PRESETS).map(([name, preset]) =>
    el(
      "button",
      {
        type: "button",
        class: "preset",
        "data-preset": name,
        title: name,
        "aria-label": `${name} theme`,
        style: `background:${preset.bg}`,
      },
      [
        el("i", { style: `background:${preset.count}` }),
        el("i", { style: `background:${preset.accent}` }),
      ],
    ),
  );

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
    ["estimate", "Estimate"],
    ["custom", "Custom"],
  ].map(([value, text]) => {
    const btn = el(
      "button",
      {
        type: "button",
        "data-source": value,
        "aria-pressed": String(useEstimate === (value === "estimate")),
      },
      text,
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
      ? `\u2248 ${estimate} years \u2014 actuarial estimate for your age.`
      : "Add your birthday to see an actuarial estimate.",
  );
  const customRow = el("div", { class: "row" }, [
    el("label", { for: "expectancy" }, "Years"),
    expectancyInput,
  ]);
  const lifeTableEl = lifeTableSelect("settings-life-table", lifeTable);
  lifeTableEl.addEventListener("change", () =>
    actions.setLifeTable(lifeTableEl.value),
  );
  const lifeTableRow = el("div", { class: "row" }, [
    el("label", { for: "settings-life-table" }, "Baseline"),
    lifeTableEl,
  ]);
  const sexEl = sexSelect("settings-sex", sex);
  sexEl.addEventListener("change", () => actions.setSex(sexEl.value || null));
  const sexRow = el("div", { class: "row" }, [
    el("label", { for: "settings-sex" }, "Sex at birth"),
    sexEl,
  ]);

  // Display: numeral typeface (segmented control) + reflection-line toggle.
  const numeralsLabel = el("label", { id: "numerals-label" }, "Numerals");
  const typefaceButtons = TYPEFACE_OPTIONS.map(([value, text, cls]) => {
    const btn = el(
      "button",
      {
        type: "button",
        class: cls,
        "data-typeface": value,
        "aria-pressed": String(typeface === value),
      },
      text,
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
    { id: "settings-zone" },
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
    "Export\u2026",
  );
  const importBtn = el(
    "button",
    { type: "button", id: "import-data", class: "btn-secondary" },
    "Import\u2026",
  );
  exportBtn.addEventListener("click", actions.exportData);
  importBtn.addEventListener("click", actions.importData);

  const resetBirthdayBtn = el(
    "button",
    { id: "reset-birthday", class: "btn-secondary" },
    "Change birthday",
  );
  const resetColorsBtn = el(
    "button",
    { id: "reset-colors", class: "btn-secondary" },
    "Reset colors",
  );
  const doneBtn = el("button", { id: "done" }, "Done");

  const settings = el("div", { class: "settings" }, [
    el("h1", { class: "screen-title" }, "Settings"),
    el("p", { class: "settings-label" }, "Presets"),
    el("div", { class: "presets" }, swatches),
    el(
      "p",
      { class: "settings-hint" },
      "A preset sets all four colors at once.",
    ),
    el("p", { class: "settings-label" }, "Colors"),
    ...rows,
    el("p", { class: "settings-label" }, "Display"),
    el("div", { class: "row" }, [numeralsLabel, typefaceSegment]),
    el("div", { class: "row" }, [
      el(
        "label",
        { for: "reflection-switch" },
        "Reflection line under the counter",
      ),
      reflectionSwitch,
    ]),
    el("p", { class: "settings-label" }, "Life expectancy"),
    el("div", { class: "row" }, [
      el("label", { id: "expectancy-source-label" }, "Source"),
      sourceSegment,
    ]),
    ...(useEstimate
      ? [
          lifeTableRow,
          estimateLine,
          sexRow,
          el(
            "p",
            { class: "settings-hint" },
            "Baseline is never inferred from your time zone. Sex at birth is optional.",
          ),
        ]
      : [customRow]),
    el("p", { class: "settings-label" }, "Time zone"),
    el("div", { class: "setup-field" }, [
      el("label", { class: "setup-label", for: "settings-zone" }, "Born in"),
      zoneSelect,
      el(
        "p",
        { class: "hint" },
        "Anchors your birthday to a fixed instant, so your age stays exact when you travel.",
      ),
    ]),
    el("p", { class: "settings-label" }, "Data"),
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
        note.textContent = `Low contrast (${ratio.toFixed(1)}:1). Aim for ${CONTRAST_MIN[key]}:1 on the background.`;
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
      title: "Back",
      "aria-label": "Back",
    },
    "\u2190",
  );
  const gear = el(
    "button",
    { class: "gear", id: "gear", title: "Settings", "aria-label": "Settings" },
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
      el("h1", { class: "age-label" }, "Life in weeks"),
      el(
        "p",
        { class: "hint" },
        `${lived.toLocaleString()} weeks lived \u00b7 ${(
          total - lived
        ).toLocaleString()} ahead \u00b7 ${expectancy} yrs`,
      ),
    ]),
    grid,
    el("div", { class: "weeks-legend" }, [
      el("span", {}, [el("i", { class: "lived" }), " Lived"]),
      el("span", {}, [el("i", { class: "now" }), " This week"]),
      el("span", {}, [el("i", { class: "future" }), " Ahead"]),
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
