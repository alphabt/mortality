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
import { el } from "./dom.js";

const COLOR_LABELS = {
  bg: "Background",
  label: "Label",
  count: "Counter",
  accent: "Accent",
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

/** Birthday entry screen. `current`/`savedZone` pre-fill the fields when editing. */
export function renderSetup(app, { start }, current, savedZone) {
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
    start(birth, zoneEl.value);
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
  [dateEl, timeEl, zoneEl].forEach((input) =>
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
export function renderCounter(app, { openSettings, onCycle }, { born }) {
  const gear = el(
    "button",
    { class: "gear", id: "gear", title: "Settings", "aria-label": "Settings" },
    gearIcon(),
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
  app.replaceChildren(gear, counter);

  gear.addEventListener("click", openSettings);
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
export function renderSettings(app, actions, { theme, expectancy }) {
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
    el("p", { class: "settings-label" }, "Life expectancy"),
    el("div", { class: "row" }, [
      el("label", { for: "expectancy" }, "Years"),
      expectancyInput,
    ]),
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
