// Controller: owns state, routes between screens, and runs the age ticker.

import { load, save, applyTheme, cssDefault, THEME_KEYS } from "./store.js";
import { renderSetup, renderCounter, renderSettings } from "./views.js";

const YEAR_MS = 31556900000; // milliseconds per year (preserved from v1.2)

const app = document.getElementById("app");
let state = load();
let timer = null;

applyTheme(state.theme);

function stopTimer() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function snapshotTheme() {
  const theme = {};
  THEME_KEYS.forEach((key) => (theme[key] = cssDefault(key)));
  return theme;
}

function showSetup() {
  stopTimer();
  renderSetup(app, { start }, state.birth);
}

function start(birth) {
  state.birth = birth;
  save(state);
  showCounter();
}

function showCounter() {
  stopTimer();
  const els = renderCounter(app, { openSettings: showSettings });
  const born = new Date(state.birth);
  (function tick() {
    const [year, fraction] = ((Date.now() - born) / YEAR_MS)
      .toFixed(9)
      .split(".");
    els.year.textContent = year;
    els.ms.textContent = fraction;
    timer = setTimeout(tick, 100);
  })();
}

function showSettings() {
  stopTimer();
  renderSettings(
    app,
    {
      setColor(key, value) {
        state.theme = { ...(state.theme || snapshotTheme()), [key]: value };
        save(state);
        applyTheme(state.theme);
      },
      resetColors() {
        state.theme = null;
        save(state);
        applyTheme(null);
        showSettings();
      },
      resetBirthday() {
        showSetup();
      },
      closeSettings() {
        showCounter();
      },
    },
    state.theme,
  );
}

if (state.birth) showCounter();
else showSetup();
