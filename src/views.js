// Pure render functions for each screen. They write markup and wire events
// to the callbacks provided by the controller (tab.js).

import { THEME_KEYS, cssDefault } from "./store.js";

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
      <h1 class="age-label">When were you born?</h1>
      <footer>
        <input type="date" id="birth-date" />
        <input type="time" id="birth-time" />
        <button id="start">Start</button>
      </footer>
    </form>`;
  const dateEl = app.querySelector("#birth-date");
  const timeEl = app.querySelector("#birth-time");
  if (current) {
    const [date, time] = splitBirth(current);
    dateEl.value = date;
    if (time) timeEl.value = time;
  }
  app.querySelector("#start").addEventListener("click", (event) => {
    event.preventDefault();
    if (!dateEl.value) return;
    start(`${dateEl.value}T${timeEl.value || "00:00"}`);
  });
  dateEl.focus();
}

/** Live age counter. Returns the two elements the ticker updates. */
export function renderCounter(app, { openSettings }) {
  app.innerHTML = `
    <button class="gear" id="gear" title="Settings" aria-label="Settings">&#9881;</button>
    <h1 class="age-label">AGE</h1>
    <h2 class="count"><span id="year">0</span><sup>.<span id="ms">0</span></sup></h2>`;
  app.querySelector("#gear").addEventListener("click", openSettings);
  return {
    year: app.querySelector("#year"),
    ms: app.querySelector("#ms"),
  };
}

/** Settings screen: colour pickers + birthday reset. */
export function renderSettings(app, actions, theme) {
  const rows = THEME_KEYS.map(
    (key) => `
      <div class="row">
        <label for="color-${key}">${COLOR_LABELS[key]}</label>
        <input type="color" id="color-${key}" value="${
          (theme && theme[key]) || cssDefault(key)
        }" />
      </div>`
  ).join("");

  app.innerHTML = `
    <div class="settings">
      <h1 class="age-label">Settings</h1>
      ${rows}
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
      .addEventListener("input", (event) => actions.setColor(key, event.target.value));
  });
  app.querySelector("#reset-birthday").addEventListener("click", actions.resetBirthday);
  app.querySelector("#reset-colors").addEventListener("click", actions.resetColors);
  app.querySelector("#done").addEventListener("click", actions.closeSettings);
}
