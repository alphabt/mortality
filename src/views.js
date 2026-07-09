// Pure render functions for each screen. They build DOM and wire events to the
// callbacks provided by the controller (tab.js).

import { THEME_KEYS, cssDefault, PRESETS } from "./store.js";
import { listTimeZones, detectZone } from "./time.js";
import { el } from "./dom.js";

const COLOR_LABELS = {
  bg: "Background",
  label: "Label",
  count: "Counter",
  accent: "Accent",
};

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
  const form = el("form", {}, [
    el("h1", { class: "screen-title" }, "When were you born?"),
    el("div", { class: "setup-row" }, [dateEl, timeEl]),
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
    start(`${dateEl.value}T${timeEl.value || "00:00"}`, zoneEl.value);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitBirth();
  });
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
    "\u2699",
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
  const counter = el("div", { class: "counter" }, [
    label,
    count,
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
  const rows = THEME_KEYS.map((key) => {
    const input = el("input", {
      type: "color",
      id: `color-${key}`,
      value: (theme && theme[key]) || cssDefault(key),
    });
    colorInputs[key] = input;
    return el("div", { class: "row" }, [
      el("label", { for: `color-${key}` }, COLOR_LABELS[key]),
      input,
    ]);
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
    el("p", { class: "settings-label" }, "Colors"),
    ...rows,
    el("p", { class: "settings-label" }, "Memento mori"),
    el("div", { class: "row" }, [
      el("label", { for: "expectancy" }, "Life expectancy (years)"),
      expectancyInput,
    ]),
    el("div", { class: "actions" }, [resetBirthdayBtn, resetColorsBtn]),
    el("div", { class: "actions" }, [doneBtn]),
  ]);
  app.replaceChildren(settings);

  THEME_KEYS.forEach((key) => {
    colorInputs[key].addEventListener("input", (event) =>
      actions.setColor(key, event.target.value),
    );
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
}
