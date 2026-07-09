// Controller: owns state, routes between screens, and runs the age ticker.

import {
  load,
  save,
  applyTheme,
  cssDefault,
  THEME_KEYS,
  MODES,
  PRESETS,
} from "./store.js";
import { renderSetup, renderCounter, renderSettings } from "./views.js";
import { birthInstantMs, detectZone, parseBirthParts } from "./time.js";
import { el } from "./dom.js";

const YEAR_MS = 31556900000; // milliseconds per year (preserved from v1.2)
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

const LABELS = {
  years: "Age",
  days: "Days lived",
  weeks: "Weeks lived",
  weeksLeft: "Weeks left",
};

const app = document.getElementById("app");
let state;
let timer = null;

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

function setScreen(name) {
  document.body.className = name ? `screen-${name}` : "";
}

export function clampExpectancy(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 80;
  return Math.min(150, Math.max(1, n));
}

export function formatBorn(birth) {
  const parts = parseBirthParts(birth);
  if (!parts) return "";
  try {
    // Format the wall-clock date exactly as entered by pinning it to UTC, so the
    // "Born …" line never slips a day when the viewer's zone differs from the
    // birth zone.
    return (
      "Born " +
      new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(Date.UTC(parts.year, parts.month - 1, parts.day))
    );
  } catch {
    return "";
  }
}

function showSetup() {
  stopTimer();
  setScreen("setup");
  renderSetup(app, { start }, state.birth, state.birthZone);
}

function start(birth, zone) {
  state.birth = birth;
  state.birthZone = zone || detectZone();
  save(state);
  showCounter();
}

function showCounter() {
  stopTimer();
  setScreen("counter");

  // Anchor the birth instant to the zone the user was born in (falling back to
  // the device zone), so age is a fixed point that never shifts when they move.
  const bornMs = birthInstantMs(state.birth, state.birthZone || detectZone());
  const expectancy = clampExpectancy(state.expectancy);
  let mode = MODES.includes(state.mode) ? state.mode : "years";

  const els = renderCounter(
    app,
    { openSettings: showSettings, onCycle: cycle },
    { born: formatBorn(state.birth) },
  );

  let intEl = null;
  let fracEl = null;
  let lastInt = null;
  let lastPct = null;
  let lastFrac = -1;

  function layout() {
    els.label.textContent = LABELS[mode];
    intEl = el("span", { class: "int" }, "0");
    if (mode === "years") {
      fracEl = el("span", { class: "fraction", "aria-hidden": "true" }, "0");
      els.count.replaceChildren(
        intEl,
        el("span", { class: "sep" }, "."),
        fracEl,
      );
    } else {
      fracEl = null;
      els.count.replaceChildren(intEl);
    }
    lastInt = null;
  }

  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    state.mode = mode;
    save(state);
    layout();
    fadeCount();
    stopTimer(); // cancel the in-flight tick so loops don't stack up per click
    tick();
  }

  function fadeCount() {
    if (
      typeof els.count.animate !== "function" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    els.count.animate(
      [
        { opacity: 0.3, transform: "translateY(0.16em)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 300, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
  }

  function updateAria(value) {
    els.count.setAttribute(
      "aria-label",
      `${LABELS[mode]} ${value}. Activate to change units.`,
    );
  }

  function tick() {
    const elapsed = Date.now() - bornMs;
    const years = elapsed / YEAR_MS;

    if (mode === "years") {
      const [whole, fraction] = years.toFixed(9).split(".");
      if (whole !== lastInt) {
        intEl.textContent = whole;
        lastInt = whole;
        updateAria(whole + " years");
      }
      fracEl.textContent = fraction;
    } else {
      let value;
      if (mode === "days") value = Math.floor(elapsed / DAY_MS);
      else if (mode === "weeks") value = Math.floor(elapsed / WEEK_MS);
      else
        value = Math.max(
          0,
          Math.round((expectancy * YEAR_MS - elapsed) / WEEK_MS),
        );
      const text = value.toLocaleString();
      if (text !== lastInt) {
        intEl.textContent = text;
        lastInt = text;
        updateAria(text);
      }
    }

    const frac = Math.min(1, Math.max(0, years / expectancy));
    if (Math.abs(frac - lastFrac) > 0.0001) {
      els.progressFill.style.transform = `scaleX(${frac.toFixed(4)})`;
      lastFrac = frac;
    }
    const pct = `${Math.floor(frac * 100)}% of ${expectancy} yrs lived`;
    if (pct !== lastPct) {
      els.pct.textContent = pct;
      lastPct = pct;
    }

    timer = setTimeout(tick, 100);
  }

  layout();
  tick();
}

function showSettings() {
  stopTimer();
  setScreen("settings");
  renderSettings(
    app,
    {
      setColor(key, value) {
        state.theme = { ...(state.theme || snapshotTheme()), [key]: value };
        save(state);
        applyTheme(state.theme);
        scheduleAmbient();
      },
      applyPreset(name) {
        const preset = PRESETS[name];
        if (!preset) return;
        state.theme = { ...preset };
        save(state);
        applyTheme(state.theme);
        scheduleAmbient();
        showSettings();
      },
      setExpectancy(value) {
        state.expectancy = clampExpectancy(value);
        save(state);
      },
      resetColors() {
        state.theme = null;
        save(state);
        applyTheme(null);
        scheduleAmbient();
        showSettings();
      },
      resetBirthday() {
        showSetup();
      },
      closeSettings() {
        showCounter();
      },
    },
    { theme: state.theme, expectancy: clampExpectancy(state.expectancy) },
  );
}

let ambientTimer = null;
function scheduleAmbient() {
  clearTimeout(ambientTimer);
  ambientTimer = setTimeout(updateAmbient, 120);
}

function setupAmbient() {
  // Paint the glow after the first frame so the number — the product — never
  // waits on the canvas work. The #ambient layer fades in from opacity 0, so a
  // one-frame delay is invisible.
  requestAnimationFrame(() => requestAnimationFrame(updateAmbient));
  setInterval(updateAmbient, 60000);
  window.addEventListener("resize", scheduleAmbient, { passive: true });
  // The baked-in background means the canvas must repaint when the OS flips
  // between light and dark, otherwise it keeps painting the old --bg.
  matchMedia("(prefers-color-scheme: dark)").addEventListener(
    "change",
    scheduleAmbient,
  );
}

// A soft radial glow whose colour, position and intensity drift with the real
// hour. A smooth low-alpha gradient this large quantises to visible concentric
// rings at 8-bit — in every engine, Chrome included — and CSS can't dither it.
// So we paint it on a <canvas> and jitter the composited pixels ourselves. This
// renders ring-free in Chrome/Firefox/Edge (the ship targets); it can still band
// in the macOS system WebKit some in-app previews use, which is cosmetic and
// never shipped. Kept very low-opacity so it never competes with the number.
function updateAmbient() {
  let cv = document.getElementById("ambient");
  if (!cv) {
    cv = document.createElement("canvas");
    cv.id = "ambient";
    document.body.prepend(cv);
  }
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  // The glow is a soft, low-frequency gradient, so a full device-resolution
  // backing store is wasteful: the getImageData + per-pixel dither pass below
  // scales with pixel count and blocked the main thread for 100-385ms per tab
  // on 4K/5K/Retina displays. Cap the longest side — CSS stretches the canvas
  // to fill the viewport either way — so every repaint stays well under a
  // frame while looking identical at this softness.
  const dpr = window.devicePixelRatio || 1;
  const MAX_SIDE = 1600;
  let w = Math.max(1, Math.round(window.innerWidth * dpr));
  let h = Math.max(1, Math.round(window.innerHeight * dpr));
  const longest = Math.max(w, h);
  if (longest > MAX_SIDE) {
    const k = MAX_SIDE / longest;
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }

  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const elevation = Math.max(0, Math.sin((Math.PI * (hour - 5)) / 16));

  let hue, sat, light, alpha, yFrac;
  if (elevation <= 0) {
    hue = 222;
    sat = 38;
    light = 58;
    alpha = 0.045;
    yFrac = 1;
  } else {
    hue = 30 + 18 * elevation;
    sat = 72 - 22 * elevation;
    light = 54 + 12 * elevation;
    alpha = 0.05 + 0.06 * elevation;
    yFrac = 1 - elevation * 0.68;
  }

  // Bake the opaque background in, then paint the glow with the engine's radial
  // gradient. Dither the *composited* RGB by a couple of levels (the same delta
  // on R/G/B, so the hue is untouched): a constant-amplitude jitter, independent
  // of the tiny glow-vs-bg contrast, that dissolves the 8-bit ring boundaries on
  // both dark and light themes. Flat background pixels are skipped, so only the
  // glow is textured.
  const bg = getComputedStyle(document.body).backgroundColor;
  const [bgR, bgG, bgB] = (bg.match(/\d+/g) || [0, 0, 0]).map(Number);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = (hour / 24) * w;
  const cy = yFrac * h;
  const radius = 0.9 * Math.max(w, h);
  // Fade through the SAME hue at decreasing alpha, never to `transparent`
  // (transparent black, which would inject a grey edge).
  const color = (mult) =>
    `hsla(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%, ${(
      alpha * mult
    ).toFixed(4)})`;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  grad.addColorStop(0, color(1));
  grad.addColorStop(0.42, color(0.35));
  grad.addColorStop(0.8, color(0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === bgR && d[i + 1] === bgG && d[i + 2] === bgB) continue;
    const n = (Math.random() - 0.5) * 8;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  cv.style.opacity = "1";
}

async function init() {
  state = await load();
  applyTheme(state.theme);
  setupAmbient();
  if (state.birth) showCounter();
  else showSetup();
}

// Auto-start only when loaded as the new-tab page (the #app host exists). Import
// under test (without that host) stays inert so unit tests can exercise the
// exported helpers without launching the ticker or ambient canvas.
if (app) init();
