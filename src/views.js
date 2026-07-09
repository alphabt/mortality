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

/** Live age counter. Returns the two elements the ticker updates. */
export function renderCounter(app, { openSettings }) {
  app.innerHTML = `
    <button class="gear" id="gear" title="Settings" aria-label="Settings">&#9881;</button>
    <div class="counter">
      <h1 class="age-label">Age</h1>
      <p class="count"><span id="year">0</span><span class="fraction" aria-hidden="true">.<span id="ms">0</span></span></p>
    </div>`;
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
      </div>`,
  ).join("");

  app.innerHTML = `
    <div class="settings">
      <h1 class="screen-title">Settings</h1>
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
      .addEventListener("input", (event) =>
        actions.setColor(key, event.target.value),
      );
  });
  app
    .querySelector("#reset-birthday")
    .addEventListener("click", actions.resetBirthday);
  app
    .querySelector("#reset-colors")
    .addEventListener("click", actions.resetColors);
  app.querySelector("#done").addEventListener("click", actions.closeSettings);
}
