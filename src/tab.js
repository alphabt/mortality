// Controller: owns state, routes between screens, and runs the age ticker.

import {
  load,
  save,
  applyTheme,
  applyTypeface,
  cssDefault,
  clampExpectancy,
  effectiveExpectancy,
  THEME_KEYS,
  MODES,
  TYPEFACES,
  PRESETS,
} from "./store.js";
import {
  renderSetup,
  renderCounter,
  renderSettings,
  updateSyncSettings,
  renderWeeks,
} from "./views.js";
import {
  birthInstantMs,
  calendarAge,
  countdownParts,
  detectZone,
  isValidZone,
  nextBirthdayInstantMs,
  parseBirthParts,
} from "./time.js";
import { estimateExpectancy, normalizeLifeTable } from "./lifetable.js";
import { el } from "./dom.js";
import { createSyncManager } from "./sync.js";
import {
  AUTOMATIC_LANGUAGE,
  activateLanguage,
  applyDocumentLocale,
  formatDate,
  formatFixedParts,
  formatList,
  formatNumber,
  formatPercent,
  formatUnit,
  formatUnitParts,
  msg,
  normalizeLanguage,
} from "./i18n.js";

const YEAR_MS = 31556900000; // milliseconds per year (preserved from v1.2)
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;

const LABELS = {
  years: "modeYears",
  calendar: "modeCalendar",
  birthday: "modeBirthday",
  days: "modeDays",
  weeks: "modeWeeks",
  yearsLeft: "modeYearsLeft",
  daysLeft: "modeDaysLeft",
  weeksLeft: "modeWeeksLeft",
};

const app = document.getElementById("app");
let state;
let timer = null;
let syncManager = null;
let syncModel = {
  available: false,
  preferences: false,
  profile: false,
  status: "unavailable",
  error: null,
  busy: false,
};

function persistState() {
  save(state).catch((error) => {
    console.error("Mortality: local settings could not be saved", error);
  });
  syncManager?.stateChanged(state);
}

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

// clampExpectancy now lives in store.js (so the store's resolver and this
// controller share one definition without a circular import); re-exported here
// because it's part of tab.js's public test surface.
export { clampExpectancy };

// Attained age in whole-and-fractional years for a stored birth, or NaN when the
// birth can't be parsed. Shared by the counter and weeks screens so both feed the
// same number into effectiveExpectancy.
function ageYearsFrom(bornMs, nowMs) {
  return Number.isFinite(bornMs) ? (nowMs - bornMs) / YEAR_MS : NaN;
}

export function formatBorn(birth) {
  const parts = parseBirthParts(birth);
  if (!parts) return "";
  try {
    // Format the wall-clock date exactly as entered by pinning it to UTC, so the
    // "Born …" line never slips a day when the viewer's zone differs from the
    // birth zone.
    return msg(
      "born",
      formatDate(Date.UTC(parts.year, parts.month - 1, parts.day), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    );
  } catch {
    return "";
  }
}

// Split a life into week cells: `total` = expectancy years × 52, `lived` = whole
// weeks elapsed (clamped to [0, total]). Pure so the grid maths is unit-testable.
export function lifeWeeks(elapsedMs, expectancy) {
  const total = clampExpectancy(expectancy) * 52;
  const lived = Math.max(0, Math.floor(elapsedMs / WEEK_MS));
  return { lived: Math.min(lived, total), total };
}

// The optional editorial line under the counter: whole years lived vs. years
// remaining against the expectancy (never negative). Number-based and pure so it
// is deterministic and unit-testable; recomputed once per counter show.
export function reflectionLine(bornMs, nowMs, expectancy) {
  const lived = Math.max(0, Math.floor((nowMs - bornMs) / YEAR_MS));
  const ahead = Math.max(0, expectancy - lived);
  return msg("reflectionLine", [formatNumber(lived), formatNumber(ahead)]);
}

export function formatProgressCaption(fraction, expectancy) {
  const floored = Math.floor(Math.min(1, Math.max(0, fraction)) * 100) / 100;
  return msg("progressCaption", [
    formatPercent(floored, { maximumFractionDigits: 0 }),
    formatNumber(expectancy),
  ]);
}

function visualUnit(value, unit, options = {}) {
  const numberTypes = new Set([
    "integer",
    "group",
    "decimal",
    "fraction",
    "minusSign",
    "plusSign",
  ]);
  return formatUnitParts(value, unit, options).map((part) =>
    el(
      "span",
      {
        class: numberTypes.has(part.type)
          ? "cal-num"
          : part.type === "unit"
            ? "cal-unit"
            : "cal-literal",
        "aria-hidden": "true",
      },
      part.value,
    ),
  );
}

// Fold an imported settings blob onto the current state, copying ONLY known keys
// and sanitising each so a hand-edited or foreign file can't inject junk. Unknown
// keys are ignored; a key the import omits keeps its current value. Pure.
export function mergeImported(current, imported) {
  const src = imported && typeof imported === "object" ? imported : {};
  const known = {};
  if ("version" in src) known.version = src.version;
  if ("birth" in src)
    known.birth = typeof src.birth === "string" ? src.birth : null;
  if ("birthZone" in src) known.birthZone = src.birthZone;
  if ("theme" in src) known.theme = src.theme;
  if ("expectancy" in src) known.expectancy = clampExpectancy(src.expectancy);
  if ("expectancySource" in src)
    known.expectancySource = ["estimate", "custom"].includes(
      src.expectancySource,
    )
      ? src.expectancySource
      : current.expectancySource;
  if ("sex" in src)
    known.sex = src.sex === "male" || src.sex === "female" ? src.sex : null;
  if ("lifeTable" in src) known.lifeTable = normalizeLifeTable(src.lifeTable);
  if ("mode" in src && MODES.includes(src.mode)) known.mode = src.mode;
  if ("typeface" in src)
    known.typeface = TYPEFACES.includes(src.typeface) ? src.typeface : "system";
  if ("reflection" in src) known.reflection = Boolean(src.reflection);
  if ("language" in src) known.language = normalizeLanguage(src.language);
  return { ...current, ...known };
}

async function changeLanguage(value, afterChange) {
  const language = normalizeLanguage(value);
  try {
    const activated = await activateLanguage(language);
    if (!activated) return;
  } catch (error) {
    console.error(`Mortality: could not load the ${language} language`, error);
    afterChange();
    return;
  }
  state.language = language;
  persistState();
  applyDocumentLocale();
  afterChange();
}

async function activateStateLanguage() {
  const language = normalizeLanguage(state.language);
  try {
    const activated = await activateLanguage(language);
    if (!activated) return;
    state.language = language;
  } catch (error) {
    console.error(`Mortality: could not load the ${language} language`, error);
    state.language = AUTOMATIC_LANGUAGE;
    await activateLanguage(AUTOMATIC_LANGUAGE);
  }
  applyDocumentLocale();
}

function showSetup(draft = null) {
  stopTimer();
  setScreen("setup");
  const value = (key) =>
    draft && Object.prototype.hasOwnProperty.call(draft, key)
      ? draft[key]
      : state[key];
  renderSetup(
    app,
    {
      start,
      setLanguage(language, nextDraft) {
        changeLanguage(language, () => showSetup(nextDraft));
      },
    },
    value("birth"),
    value("birthZone"),
    value("sex"),
    value("lifeTable"),
    state.language,
  );
}

function start(birth, zone, sex, lifeTable) {
  state.birth = birth;
  state.birthZone = zone || detectZone();
  state.sex = sex === "male" || sex === "female" ? sex : null;
  state.lifeTable = normalizeLifeTable(lifeTable);
  persistState();
  showCounter();
}

function showCounter() {
  stopTimer();
  setScreen("counter");

  // Anchor the birth instant to the zone the user was born in (falling back to
  // the device zone), so age is a fixed point that never shifts when they move.
  // The same effective zone drives the calendar-age breakdown below.
  const zone = isValidZone(state.birthZone) ? state.birthZone : detectZone();
  const bornMs = birthInstantMs(state.birth, zone);
  let birthdayTarget = nextBirthdayInstantMs(state.birth, Date.now(), zone);
  // Resolve expectancy for the attained age: a custom number is honoured
  // verbatim, otherwise it's an actuarial estimate that legitimately rises a
  // little as the user ages (recomputed here, once per counter show).
  const expectancy = effectiveExpectancy(
    state,
    ageYearsFrom(bornMs, Date.now()),
  );
  let mode = MODES.includes(state.mode) ? state.mode : "years";

  // The reflection line changes at most once a year, so compute it once on show
  // and hand it to the renderer — the ticker never has to touch it.
  const reflection = state.reflection
    ? reflectionLine(bornMs, Date.now(), expectancy)
    : null;

  const els = renderCounter(
    app,
    { openSettings: showSettings, onCycle: cycle, openWeeks: showWeeks },
    { born: formatBorn(state.birth), reflection },
  );

  let intEl = null;
  let fracEl = null;
  let lastInt = null;
  let lastPct = null;
  let lastFrac = -1;
  let lastCal = null;
  let lastBirthday = null;

  function layout() {
    els.label.textContent = msg(LABELS[mode]);
    els.count.classList.toggle("birthday-count", mode === "birthday");
    if (mode === "calendar" || mode === "birthday") {
      intEl = null;
      fracEl = null;
      // Compound spans are (re)built in tick() only when their value changes.
      els.count.replaceChildren();
    } else {
      intEl = el("span", { class: "int" }, "0");
      if (mode === "years" || mode === "yearsLeft") {
        fracEl = el("span", { class: "fraction", "aria-hidden": "true" }, "0");
        els.count.replaceChildren(intEl, el("span", { class: "sep" }), fracEl);
      } else {
        fracEl = null;
        els.count.replaceChildren(intEl);
      }
    }
    lastInt = null;
    lastCal = null;
    lastBirthday = null;
  }

  function cycle() {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    state.mode = mode;
    persistState();
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
      msg("counterAria", [msg(LABELS[mode]), value, msg("changeUnitsAction")]),
    );
  }

  function tick() {
    const now = Date.now();
    const elapsed = now - bornMs;
    const years = elapsed / YEAR_MS;

    if (mode === "years" || mode === "yearsLeft") {
      const shown = mode === "years" ? years : Math.max(0, expectancy - years);
      const fixed = formatFixedParts(shown, 9);
      if (fixed.integer !== lastInt) {
        intEl.textContent = fixed.integer;
        lastInt = fixed.integer;
      }
      els.count.querySelector(".sep").textContent = fixed.decimal;
      fracEl.textContent = fixed.fraction;
      updateAria(
        formatUnit(shown, "year", {
          minimumFractionDigits: 9,
          maximumFractionDigits: 9,
          useGrouping: false,
        }),
      );
    } else if (mode === "calendar") {
      const { y, m, d } = calendarAge(bornMs, now, zone);
      const key = `${y}|${m}|${d}`;
      // Only rewrite the DOM when the y/m/d actually changes (days tick over at
      // most once a day), so the node isn't rebuilt every 100ms.
      if (key !== lastCal) {
        els.count.replaceChildren(
          ...visualUnit(y, "year"),
          ...visualUnit(m, "month"),
          ...visualUnit(d, "day"),
        );
        lastCal = key;
        updateAria(
          formatList([
            formatUnit(y, "year"),
            formatUnit(m, "month"),
            formatUnit(d, "day"),
          ]),
        );
      }
    } else if (mode === "birthday") {
      if (birthdayTarget <= now) {
        birthdayTarget = nextBirthdayInstantMs(state.birth, now, zone);
      }
      const parts = countdownParts(birthdayTarget - now);
      const key = `${parts.days}|${parts.hours}|${parts.minutes}|${parts.seconds}`;
      // The 100ms ticker may run ten times per displayed second; keep the same
      // nodes until the rounded-up countdown actually changes.
      if (key !== lastBirthday) {
        els.count.replaceChildren(
          ...visualUnit(parts.days, "day"),
          ...visualUnit(parts.hours, "hour", { minimumIntegerDigits: 2 }),
          ...visualUnit(parts.minutes, "minute", { minimumIntegerDigits: 2 }),
          ...visualUnit(parts.seconds, "second", { minimumIntegerDigits: 2 }),
        );
        lastBirthday = key;
        updateAria(
          msg(
            "birthdayCountdown",
            formatList([
              formatUnit(parts.days, "day"),
              formatUnit(parts.hours, "hour"),
              formatUnit(parts.minutes, "minute"),
              formatUnit(parts.seconds, "second"),
            ]),
          ),
        );
      }
    } else {
      let value;
      if (mode === "days") value = Math.floor(elapsed / DAY_MS);
      else if (mode === "weeks") value = Math.floor(elapsed / WEEK_MS);
      else if (mode === "daysLeft")
        value = Math.max(
          0,
          Math.round((expectancy * YEAR_MS - elapsed) / DAY_MS),
        );
      else
        value = Math.max(
          0,
          Math.round((expectancy * YEAR_MS - elapsed) / WEEK_MS),
        );
      const text = formatNumber(value);
      if (text !== lastInt) {
        intEl.textContent = text;
        lastInt = text;
        const unit = mode === "days" || mode === "daysLeft" ? "day" : "week";
        updateAria(formatUnit(value, unit));
      }
    }

    const frac = Math.min(1, Math.max(0, years / expectancy));
    if (Math.abs(frac - lastFrac) > 0.0001) {
      els.progressFill.style.transform = `scaleX(${frac.toFixed(4)})`;
      lastFrac = frac;
    }
    const pct = formatProgressCaption(frac, expectancy);
    if (pct !== lastPct) {
      els.pct.textContent = pct;
      lastPct = pct;
    }

    timer = setTimeout(tick, 100);
  }

  layout();
  tick();
}

// Full-screen life calendar: one row per year, one cell per week. Static per
// open (no ticker) — stopTimer() cancels the counter loop before we switch.
function showWeeks() {
  stopTimer();
  setScreen("weeks");
  const zone = isValidZone(state.birthZone) ? state.birthZone : detectZone();
  const bornMs = birthInstantMs(state.birth, zone);
  const expectancy = effectiveExpectancy(
    state,
    ageYearsFrom(bornMs, Date.now()),
  );
  const { lived, total } = lifeWeeks(Date.now() - bornMs, expectancy);
  renderWeeks(
    app,
    { back: showCounter, openSettings: showSettings },
    {
      born: formatBorn(state.birth),
      lived,
      total,
      expectancy,
    },
  );
}

function showSettings() {
  stopTimer();
  setScreen("settings");
  renderSettings(
    app,
    {
      setColor(key, value) {
        state.theme = { ...(state.theme || snapshotTheme()), [key]: value };
        persistState();
        applyTheme(state.theme);
        scheduleAmbient();
      },
      applyPreset(name) {
        const preset = PRESETS[name];
        if (!preset) return;
        state.theme = { ...preset };
        persistState();
        applyTheme(state.theme);
        scheduleAmbient();
        showSettings();
      },
      setExpectancy(value) {
        state.expectancy = clampExpectancy(value);
        persistState();
      },
      setExpectancySource(value) {
        state.expectancySource = value === "custom" ? "custom" : "estimate";
        persistState();
        // Re-render so the manual Years input swaps with the read-only estimate.
        showSettings();
      },
      setSex(value) {
        state.sex = value === "male" || value === "female" ? value : null;
        persistState();
        // Re-render so the estimate line reflects the new sex immediately.
        showSettings();
      },
      setLifeTable(value) {
        state.lifeTable = normalizeLifeTable(value);
        persistState();
        showSettings();
      },
      resetColors() {
        state.theme = null;
        persistState();
        applyTheme(null);
        scheduleAmbient();
        showSettings();
      },
      resetBirthday() {
        showSetup();
      },
      setTypeface(value) {
        state.typeface = value;
        persistState();
        applyTypeface(value);
        showSettings();
      },
      toggleReflection() {
        state.reflection = !state.reflection;
        persistState();
        showSettings();
      },
      setZone(value) {
        state.birthZone = value;
        persistState();
      },
      setLanguage(value) {
        changeLanguage(value, showSettings);
      },
      exportData() {
        const blob = new Blob([JSON.stringify(state, null, 2)], {
          type: "application/json",
        });
        const a = el("a", {
          href: URL.createObjectURL(blob),
          download: "mortality-settings.json",
        });
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      },
      importData() {
        const input = el("input", {
          type: "file",
          accept: "application/json",
          hidden: true,
        });
        input.addEventListener("change", async () => {
          const file = input.files && input.files[0];
          input.remove();
          if (!file) return;
          let parsed;
          try {
            parsed = JSON.parse(await file.text());
          } catch (err) {
            console.warn("Mortality: could not read imported settings", err);
            return;
          }
          state = mergeImported(state, parsed);
          await activateStateLanguage();
          persistState();
          applyTheme(state.theme);
          applyTypeface(state.typeface);
          if (state.birth) showCounter();
          else showSetup();
        });
        document.body.append(input);
        input.click();
      },
      closeSettings() {
        showCounter();
      },
      toggleSyncPreferences(enabled) {
        void syncManager?.togglePreferences(enabled);
      },
      toggleSyncProfile(enabled) {
        void syncManager?.toggleProfile(enabled);
      },
      retrySync() {
        void syncManager?.retry();
      },
    },
    {
      theme: state.theme,
      expectancy: clampExpectancy(state.expectancy),
      expectancySource:
        state.expectancySource === "custom" ? "custom" : "estimate",
      sex: state.sex === "male" || state.sex === "female" ? state.sex : null,
      lifeTable: normalizeLifeTable(state.lifeTable),
      estimate: settingsEstimate(),
      typeface: state.typeface,
      reflection: state.reflection,
      birthZone: state.birthZone,
      language: state.language,
      sync: syncModel,
    },
  );
}

// The actuarial estimate to preview in Settings, for the user's current age and
// sex at birth — independent of whichever source is active, so the "Estimate"
// option can always show the number it would apply. Null when there's no
// birthday yet to derive an age from.
function settingsEstimate() {
  const zone = isValidZone(state.birthZone) ? state.birthZone : detectZone();
  const bornMs = birthInstantMs(state.birth, zone);
  const ageYears = ageYearsFrom(bornMs, Date.now());
  return Number.isFinite(ageYears)
    ? estimateExpectancy(ageYears, state.sex, state.lifeTable)
    : null;
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
    // Night: a dim, cool pool of light. Anchored to the very bottom edge with a
    // near-invisible alpha, the old glow read as a barely-there sliver after
    // dark; lift the centre off the floor (yFrac < 1) and give it a touch more
    // presence so it stays legible at a glance, yet sits high enough above the
    // lower-left counter that its text keeps its AA contrast. Still calmer than
    // the daytime peak (alpha 0.11), preserving the day/night rhythm.
    hue = 222;
    sat = 38;
    light = 58;
    alpha = 0.06;
    yFrac = 0.7;
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

  // On a light theme the glow *darkens* the canvas instead of lifting it off a
  // dark ground, and the lower-left counter already sits at nearly the lowest
  // AA contrast the palette allows — so a glow pooled over that corner would
  // push its label below 4.5:1. When the background is light, keep the glow in
  // the upper band and clear of the counter's column: pool the cool night light
  // in the empty upper-right, and hold the warm daytime wash centre-right,
  // deepening it in proportion to the sun's height (boldest near midday). The
  // dark theme, where the glow adds light and never touches the text, is left
  // untouched.
  let cxFrac = hour / 24;
  let cyFrac = yFrac;
  const bgLum = (0.299 * bgR + 0.587 * bgG + 0.114 * bgB) / 255;
  if (bgLum > 0.6) {
    cyFrac = Math.min(cyFrac, 0.3);
    if (elevation <= 0) {
      cxFrac = 0.72;
      light = 47;
      sat = 50;
      alpha = 0.115;
    } else {
      cxFrac = Math.max(cxFrac, 0.55);
      light -= 5 * elevation;
      sat += 7 * elevation;
      alpha += 0.075 * elevation;
    }
  }

  const cx = cxFrac * w;
  const cy = cyFrac * h;
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

async function applySyncedState(nextState) {
  const activeScreen = document.body.className;
  state = nextState;
  await activateStateLanguage();
  applyTheme(state.theme);
  applyTypeface(state.typeface);
  scheduleAmbient();

  if (!parseBirthParts(state.birth)) {
    showSetup();
  } else if (activeScreen === "screen-settings") {
    showSettings();
  } else if (activeScreen === "screen-weeks") {
    showWeeks();
  } else {
    showCounter();
  }
}

async function init() {
  state = await load();
  syncManager = createSyncManager({
    persistLocal: save,
    onRemoteState: applySyncedState,
    onStatus(model) {
      syncModel = model;
      updateSyncSettings(app, model);
    },
  });
  state = await syncManager.initialize(state);
  await activateStateLanguage();
  applyTheme(state.theme);
  applyTypeface(state.typeface);

  // Escape returns to the counter from the weeks and settings screens, so those
  // views are dismissable from the keyboard, not only via the corner control.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !state || !state.birth) return;
    const screen = document.body.className;
    if (screen === "screen-weeks" || screen === "screen-settings") {
      showCounter();
    }
  });

  setupAmbient();
  if (state.birth) showCounter();
  else showSetup();
}

// Auto-start only when loaded as the new-tab page (the #app host exists). Import
// under test (without that host) stays inert so unit tests can exercise the
// exported helpers without launching the ticker or ambient canvas.
if (app) init();
