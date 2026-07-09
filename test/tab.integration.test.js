// End-to-end-ish tests for the controller in tab.js. Each test boots a fresh
// module instance against a real (jsdom) DOM with a fixed clock, mocked storage
// via the localStorage fallback, and fake timers so the age ticker never loops.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PRESETS } from "../src/store.js";

const YEAR_MS = 31556900000; // must match tab.js
const DAY_MS = 86400000;

// init() is fired at import time and is async; drain the microtask queue so its
// awaited load() settles before we assert. Timers stay fake, so the ticker's
// setTimeout loop never advances on its own.
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

async function boot() {
  vi.resetModules();
  await import("../src/tab.js");
  await flush();
}

function seed(state) {
  localStorage.setItem(
    "mortality",
    JSON.stringify({
      version: 1,
      birth: null,
      theme: null,
      expectancy: 80,
      mode: "years",
      ...state,
    }),
  );
}

function stored() {
  return JSON.parse(localStorage.getItem("mortality"));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2020-01-01T00:00:00"));
  document.body.innerHTML = '<div id="app"></div>';
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("initial routing", () => {
  it("shows the setup screen when no birthday is stored", async () => {
    await boot();
    expect(document.body.className).toBe("screen-setup");
    expect(document.querySelector("#birth-date")).not.toBeNull();
    expect(document.querySelector(".screen-title").textContent).toBe(
      "When were you born?",
    );
  });

  it("shows the counter when a birthday is stored", async () => {
    seed({ birth: "2000-01-01T00:00" });
    await boot();
    expect(document.body.className).toBe("screen-counter");
    const intEl = document.querySelector("#count .int");
    const bornMs = new Date("2000-01-01T00:00").getTime();
    const expected = ((Date.now() - bornMs) / YEAR_MS).toFixed(9).split(".")[0];
    expect(intEl.textContent).toBe(expected);
  });

  it("shows a life-progress percentage on the counter", async () => {
    seed({ birth: "2000-01-01T00:00", expectancy: 80 });
    await boot();
    expect(document.querySelector("#pct").textContent).toMatch(
      /^\d+% of 80 yrs lived$/,
    );
  });
});

describe("setup flow", () => {
  it("saves the entered birthday and switches to the counter", async () => {
    await boot();
    document.querySelector("#birth-date").value = "1990-06-15";
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(document.body.className).toBe("screen-counter");
    expect(stored().birth).toBe("1990-06-15T00:00");
  });
});

describe("counter interactions", () => {
  it("cycles the unit and persists the new mode on click", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "years" });
    await boot();

    // years -> calendar (the new mode inserted after years).
    document.querySelector("#count").click();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Calendar age",
    );
    expect(stored().mode).toBe("calendar");

    // calendar -> days.
    document.querySelector("#count").click();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Days lived",
    );
    expect(stored().mode).toBe("days");

    const bornMs = new Date("2000-01-01T00:00").getTime();
    const expectedDays = Math.floor(
      (Date.now() - bornMs) / DAY_MS,
    ).toLocaleString();
    expect(document.querySelector("#count .int").textContent).toBe(
      expectedDays,
    );
  });

  it("advances the age as time passes", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "days" });
    await boot();
    const before = document.querySelector("#count .int").textContent;

    // Jump forward two days and let one tick run.
    vi.setSystemTime(new Date("2020-01-03T00:00:00"));
    await vi.advanceTimersByTimeAsync(150);

    const after = document.querySelector("#count .int").textContent;
    expect(Number(after.replaceAll(",", ""))).toBe(
      Number(before.replaceAll(",", "")) + 2,
    );
  });

  it("renders the weeks-lived count", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "weeks" });
    await boot();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Weeks lived",
    );
    const bornMs = new Date("2000-01-01T00:00").getTime();
    const expected = Math.floor(
      (Date.now() - bornMs) / (7 * DAY_MS),
    ).toLocaleString();
    expect(document.querySelector("#count .int").textContent).toBe(expected);
  });

  it("renders the weeks-left countdown from life expectancy", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "weeksLeft", expectancy: 80 });
    await boot();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Weeks left",
    );
    const bornMs = new Date("2000-01-01T00:00").getTime();
    const elapsed = Date.now() - bornMs;
    const expected = Math.max(
      0,
      Math.round((80 * YEAR_MS - elapsed) / (7 * DAY_MS)),
    ).toLocaleString();
    expect(document.querySelector("#count .int").textContent).toBe(expected);
  });

  it("renders the years-left countdown as a live fraction", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "yearsLeft", expectancy: 80 });
    await boot();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Years left",
    );

    const whole = document.querySelector("#count .int").textContent;
    const fraction = document.querySelector("#count .fraction").textContent;
    const value = Number(`${whole}.${fraction}`);

    // Counts down toward zero: never negative, never past the full expectancy,
    // and strictly below it because the birth is in the past.
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(80);
    expect(value).toBeLessThan(80);

    // Mirrors the implementation exactly: (expectancy - lived years) to 9 dp.
    const bornMs = new Date("2000-01-01T00:00").getTime();
    const [expWhole, expFraction] = Math.max(
      0,
      80 - (Date.now() - bornMs) / YEAR_MS,
    )
      .toFixed(9)
      .split(".");
    expect(whole).toBe(expWhole);
    expect(fraction).toBe(expFraction);

    // Advancing the clock shrinks the remaining time.
    vi.setSystemTime(new Date("2020-01-02T00:00:00"));
    await vi.advanceTimersByTimeAsync(150);
    const later = Number(
      `${document.querySelector("#count .int").textContent}.${
        document.querySelector("#count .fraction").textContent
      }`,
    );
    expect(later).toBeLessThan(value);
  });

  it("renders the days-left countdown from life expectancy", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "daysLeft", expectancy: 80 });
    await boot();
    expect(document.querySelector("#unit-label").textContent).toBe("Days left");

    const bornMs = new Date("2000-01-01T00:00").getTime();
    const elapsed = Date.now() - bornMs;
    const expected = Math.max(0, Math.round((80 * YEAR_MS - elapsed) / DAY_MS));
    expect(document.querySelector("#count .int").textContent).toBe(
      expected.toLocaleString(),
    );
    // A normal past birth leaves a positive whole number of days remaining.
    expect(expected).toBeGreaterThan(0);
    expect(Number.isInteger(expected)).toBe(true);
  });

  it("renders the calendar-age breakdown as number + unit spans", async () => {
    // System clock is 2020-01-01 and the birth is 2000-01-01 (same wall-clock
    // date twenty years apart), so the breakdown is exactly 20yr 0mo 0d.
    seed({ birth: "2000-01-01T00:00", mode: "calendar" });
    await boot();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Calendar age",
    );

    const nums = [...document.querySelectorAll("#count .cal-num")].map(
      (n) => n.textContent,
    );
    const units = [...document.querySelectorAll("#count .cal-unit")].map(
      (n) => n.textContent,
    );
    expect(nums).toEqual(["20", "0", "0"]);
    expect(units).toEqual(["yr", "mo", "d"]);
    expect(document.querySelector("#count").getAttribute("aria-label")).toBe(
      "Calendar age 20 years 0 months 0 days. Activate to change units.",
    );
  });
});

describe("settings routing and edits", () => {
  beforeEach(() => {
    seed({ birth: "2000-01-01T00:00" });
  });

  it("opens settings from the gear and returns via done", async () => {
    await boot();
    document.querySelector("#gear").click();
    expect(document.body.className).toBe("screen-settings");
    expect(document.querySelector("#expectancy")).not.toBeNull();

    document.querySelector("#done").click();
    expect(document.body.className).toBe("screen-counter");
  });

  it("clamps and persists an edited life expectancy", async () => {
    await boot();
    document.querySelector("#gear").click();
    const input = document.querySelector("#expectancy");
    input.value = "200";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(stored().expectancy).toBe(150);
  });

  it("persists an individual color edit and applies it live", async () => {
    await boot();
    document.querySelector("#gear").click();
    const input = document.querySelector("#color-accent");
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(stored().theme.accent).toBe("#abcdef");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "#abcdef",
    );
  });

  it("applies a preset, persisting the theme and setting CSS variables", async () => {
    await boot();
    document.querySelector("#gear").click();
    document.querySelector('.preset[data-preset="Void"]').click();

    expect(stored().theme).toEqual(PRESETS.Void);
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      PRESETS.Void.accent,
    );
  });

  it("resets custom colors back to the system default", async () => {
    await boot();
    document.querySelector("#gear").click();
    document.querySelector('.preset[data-preset="Amber"]').click();
    expect(stored().theme).toEqual(PRESETS.Amber);

    document.querySelector("#reset-colors").click();

    expect(stored().theme).toBeNull();
    expect(document.body.className).toBe("screen-settings");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe(
      "",
    );
  });

  it("returns to the setup screen when changing the birthday", async () => {
    await boot();
    document.querySelector("#gear").click();
    document.querySelector("#reset-birthday").click();
    expect(document.body.className).toBe("screen-setup");
  });
});

describe("reduced motion", () => {
  it("skips the count fade animation when the user prefers reduced motion", async () => {
    window.matchMedia = vi.fn((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const animateSpy = vi.spyOn(Element.prototype, "animate");
    seed({ birth: "2000-01-01T00:00" });
    await boot();

    document.querySelector("#count").click();

    expect(animateSpy).not.toHaveBeenCalled();
  });
});
