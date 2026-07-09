// Pure render functions for each screen. They write markup and wire events
// to the callbacks provided by the controller (tab.js).

import { THEME_KEYS, cssDefault, PRESETS } from "./store.js";

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

/** Birthday entry screen. `current` pre-fills the fields when editing. */
export function renderSetup(app, { start }, current) {
  app.innerHTML = `
    <form>
      <h1 class="screen-title">When were you born?</h1>
      <footer>
        <input type="date" id="birth-date" aria-label="Date of birth" autocomplete="bday" required />
        <input type="time" id="birth-time" aria-label="Time of birth (optional)" />
        <button id="start">Start</button>
      </footer>
    </form>`;
  const form = app.querySelector("form");
  const dateEl = app.querySelector("#birth-date");
  const timeEl = app.querySelector("#birth-time");
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
    start(`${dateEl.value}T${timeEl.value || "00:00"}`);
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitBirth();
  });
  [dateEl, timeEl].forEach((el) =>
    el.addEventListener("keydown", (event) => {
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
  app.innerHTML = `
    <button class="gear" id="gear" title="Settings" aria-label="Settings">&#9881;</button>
    <div class="counter">
      <h1 class="age-label" id="unit-label">Age</h1>
      <p class="count" id="count" role="button" tabindex="0"
         aria-label="Change units" title="Click to change units"></p>
      <div class="meta">
        <div class="progress" aria-hidden="true"><span class="progress-fill" id="progress-fill"></span></div>
        <div class="meta-row">
          <span class="born">${born}</span>
          <span class="pct" id="pct"></span>
        </div>
      </div>
    </div>`;
  app.querySelector("#gear").addEventListener("click", openSettings);
  const count = app.querySelector("#count");
  count.addEventListener("click", onCycle);
  count.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCycle();
    }
  });
  return {
    label: app.querySelector("#unit-label"),
    count,
    progressFill: app.querySelector("#progress-fill"),
    pct: app.querySelector("#pct"),
  };
}

/** Settings screen: presets + colour pickers + life expectancy + resets. */
export function renderSettings(app, actions, { theme, expectancy }) {
  const rows = THEME_KEYS.map(
    (key) => `
      <div class="row">
        <label for="color-${key}">${COLOR_LABELS[key]}</label>
        <input type="color" id="color-${key}" value="${
          (theme && theme[key]) || cssDefault(key)
        }" />
      </div>`,
  ).join("");

  const swatches = Object.entries(PRESETS)
    .map(
      ([name, preset]) => `
      <button type="button" class="preset" data-preset="${name}"
              title="${name}" aria-label="${name} theme" style="background:${preset.bg}">
        <i style="background:${preset.count}"></i><i style="background:${preset.accent}"></i>
      </button>`,
    )
    .join("");

  app.innerHTML = `
    <div class="settings">
      <h1 class="screen-title">Settings</h1>
      <p class="settings-label">Presets</p>
      <div class="presets">${swatches}</div>
      <p class="settings-label">Colors</p>
      ${rows}
      <p class="settings-label">Memento mori</p>
      <div class="row">
        <label for="expectancy">Life expectancy (years)</label>
        <input type="number" id="expectancy" min="1" max="150" step="1" value="${expectancy}" />
      </div>
      <div class="actions">
        <button id="reset-birthday" class="btn-secondary">Change birthday</button>
        <button id="reset-colors" class="btn-secondary">Reset colors</button>
      </div>
      <div class="actions">
        <button id="done">Done</button>
      </div>
    </div>`;

  THEME_KEYS.forEach((key) => {
    app
      .querySelector(`#color-${key}`)
      .addEventListener("input", (event) =>
        actions.setColor(key, event.target.value),
      );
  });
  app.querySelectorAll(".preset").forEach((btn) => {
    btn.addEventListener("click", () =>
      actions.applyPreset(btn.dataset.preset),
    );
  });
  app
    .querySelector("#expectancy")
    .addEventListener("input", (event) =>
      actions.setExpectancy(event.target.value),
    );
  app
    .querySelector("#reset-birthday")
    .addEventListener("click", actions.resetBirthday);
  app
    .querySelector("#reset-colors")
    .addEventListener("click", actions.resetColors);
  app.querySelector("#done").addEventListener("click", actions.closeSettings);
}
