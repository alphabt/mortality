// End-to-end-ish tests for the controller in tab.js. Each test boots a fresh
// module instance against a real (jsdom) DOM with a fixed clock, mocked storage
// via the localStorage fallback, and fake timers so the age ticker never loops.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PRESETS } from "../src/store.js";
import { estimateExpectancy } from "../src/lifetable.js";

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
  delete globalThis.browser;
  delete globalThis.chrome;
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

  describe("localized integration", () => {
    it("uses a non-English translator across counter and settings renders", async () => {
      globalThis.chrome = {
        i18n: {
          getUILanguage: () => "de",
          getMessage: (key) => (key.startsWith("@@") ? "" : `de:${key}`),
        },
      };
      seed({ birth: "2000-01-01T00:00", mode: "years" });
      await boot();

      expect(document.querySelector("#unit-label").textContent).toBe(
        "de:modeYears",
      );
      expect(document.querySelector("#pct").textContent).toBe(
        "de:progressCaption",
      );
      expect(document.querySelector(".born").textContent).toBe("de:born");

      document.querySelector("#gear").click();
      expect(document.querySelector(".screen-title").textContent).toBe(
        "de:settings",
      );
      const sectionLabels = [
        ...document.querySelectorAll(".settings-label"),
      ].map((node) => node.textContent);
      expect(sectionLabels).toContain("de:sectionPresets");
      expect(sectionLabels).toContain("de:sectionLifeExpectancy");
    });
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

  it("persists the optional sex chosen at setup", async () => {
    await boot();
    document.querySelector("#birth-date").value = "1990-06-15";
    document.querySelector("#birth-sex").value = "female";
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(stored().sex).toBe("female");
    // A brand-new setup leaves the actuarial estimate as the active source.
    expect(stored().expectancySource).toBe("estimate");
    expect(stored().lifeTable).toBe("world");
  });

  it("persists an explicitly selected U.S. actuarial baseline", async () => {
    await boot();
    document.querySelector("#birth-date").value = "1990-06-15";
    document.querySelector("#birth-life-table").value = "us";
    document
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(stored().lifeTable).toBe("us");
  });
});

describe("counter interactions", () => {
  it("cycles the unit and persists the new mode on click", async () => {
    seed({ birth: "2000-01-01T00:00", mode: "years" });
    await boot();

    // years -> calendar.
    document.querySelector("#count").click();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Calendar age",
    );
    expect(stored().mode).toBe("calendar");

    // calendar -> birthday (inserted immediately after calendar).
    document.querySelector("#count").click();
    expect(document.querySelector("#unit-label").textContent).toBe(
      "Next birthday",
    );
    expect(stored().mode).toBe("birthday");

    // birthday -> days.
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
    expect(units).toEqual(["y", "m", "d"]);
    expect(document.querySelector("#count").getAttribute("aria-label")).toBe(
      "Calendar age 20 years, 0 months, and 0 days. Activate to change units.",
    );
  });

  it("renders the next birthday in the birth zone with a readable label", async () => {
    vi.setSystemTime(new Date("2024-03-14T00:00:00Z"));
    seed({
      birth: "2000-03-15T09:30",
      birthZone: "Asia/Tokyo",
      mode: "birthday",
    });
    await boot();

    expect(document.querySelector("#unit-label").textContent).toBe(
      "Next birthday",
    );
    expect(
      [...document.querySelectorAll("#count .cal-num")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["1", "00", "30", "00"]);
    expect(
      [...document.querySelectorAll("#count .cal-unit")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["d", "h", "m", "s"]);
    expect(document.querySelector("#count").getAttribute("aria-label")).toBe(
      "Next birthday in 1 day, 0 hours, 30 minutes, and 0 seconds. Activate to change units.",
    );
  });

  it("decrements live without rebuilding inside the displayed second", async () => {
    vi.setSystemTime(new Date("2019-12-31T23:59:54.100Z"));
    seed({
      birth: "2000-01-01T00:00",
      birthZone: "UTC",
      mode: "birthday",
    });
    await boot();

    const firstDayNode = document.querySelector("#count .cal-num");
    expect(
      [...document.querySelectorAll("#count .cal-num")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["0", "00", "00", "06"]);

    await vi.advanceTimersByTimeAsync(100);
    expect(document.querySelector("#count .cal-num")).toBe(firstDayNode);

    await vi.advanceTimersByTimeAsync(900);
    expect(document.querySelector("#count .cal-num")).not.toBe(firstDayNode);
    expect(
      [...document.querySelectorAll("#count .cal-num")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["0", "00", "00", "05"]);
  });

  it("rolls directly to the following birthday at the target instant", async () => {
    vi.setSystemTime(new Date("2019-12-31T23:59:59.500Z"));
    seed({
      birth: "2000-01-01T00:00",
      birthZone: "UTC",
      mode: "birthday",
    });
    await boot();

    expect(
      [...document.querySelectorAll("#count .cal-num")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["0", "00", "00", "01"]);
    expect(document.querySelector("#count").getAttribute("aria-label")).toBe(
      "Next birthday in 0 days, 0 hours, 0 minutes, and 1 second. Activate to change units.",
    );

    await vi.advanceTimersByTimeAsync(500);
    expect(
      [...document.querySelectorAll("#count .cal-num")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["366", "00", "00", "00"]);
    expect(document.querySelector("#count").getAttribute("aria-label")).toBe(
      "Next birthday in 366 days, 0 hours, 0 minutes, and 0 seconds. Activate to change units.",
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

describe("settings: life-expectancy source, baseline, and sex", () => {
  const bornMs = new Date("2000-01-01T00:00").getTime();
  const ageYears = (from) => (from - bornMs) / YEAR_MS;

  it("uses the actuarial estimate as the counter denominator in estimate mode", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      sex: "male",
      mode: "years",
    });
    await boot();
    const expected = estimateExpectancy(ageYears(Date.now()), "male");
    const caption = document.querySelector("#pct").textContent;
    const shown = Number(caption.match(/of (\d+) yrs lived/)[1]);
    expect(shown).toBe(expected);
    // A 20-year-old's conditional expectancy differs from the flat at-birth 80.
    expect(shown).not.toBe(80);
  });

  it("uses the explicitly selected U.S. baseline", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      lifeTable: "us",
      sex: "male",
      mode: "years",
    });
    await boot();
    const expected = estimateExpectancy(ageYears(Date.now()), "male", "us");
    const shown = Number(
      document.querySelector("#pct").textContent.match(/of (\d+) yrs lived/)[1],
    );
    expect(shown).toBe(expected);
  });

  it("reflects the chosen sex in the estimate denominator", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      sex: "female",
      mode: "years",
    });
    await boot();
    const expected = estimateExpectancy(ageYears(Date.now()), "female");
    const shown = Number(
      document.querySelector("#pct").textContent.match(/of (\d+) yrs lived/)[1],
    );
    expect(shown).toBe(expected);
  });

  it("switches source to estimate from settings, swapping the manual input out", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "custom",
      expectancy: 80,
    });
    await boot();
    document.querySelector("#gear").click();
    // Custom mode shows the editable Years input.
    expect(document.querySelector("#expectancy")).not.toBeNull();

    document.querySelector('[data-source="estimate"]').click();
    expect(stored().expectancySource).toBe("estimate");
    // Estimate mode hides the manual input and previews the figure instead.
    expect(document.querySelector("#expectancy")).toBeNull();
    expect(document.querySelector("#expectancy-estimate")).not.toBeNull();
  });

  it("switches back to custom, restoring the editable input", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      sex: "male",
    });
    await boot();
    document.querySelector("#gear").click();
    expect(document.querySelector("#expectancy")).toBeNull();

    document.querySelector('[data-source="custom"]').click();
    expect(stored().expectancySource).toBe("custom");
    expect(document.querySelector("#expectancy")).not.toBeNull();
  });

  it("changes the sex from settings and persists it", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      sex: null,
    });
    await boot();
    document.querySelector("#gear").click();
    const sex = document.querySelector("#settings-sex");
    sex.value = "male";
    sex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(stored().sex).toBe("male");
    // The estimate line re-renders for the new sex.
    expect(document.querySelector("#expectancy-estimate")).not.toBeNull();
  });

  it("changes the actuarial baseline from settings and persists it", async () => {
    seed({
      birth: "2000-01-01T00:00",
      expectancySource: "estimate",
      lifeTable: "world",
      sex: "male",
    });
    await boot();
    document.querySelector("#gear").click();
    const lifeTable = document.querySelector("#settings-life-table");
    expect(lifeTable.value).toBe("world");
    lifeTable.value = "us";
    lifeTable.dispatchEvent(new Event("change", { bubbles: true }));
    expect(stored().lifeTable).toBe("us");
    expect(document.querySelector("#settings-life-table").value).toBe("us");
  });
});

describe("settings: display, reflection, and zone", () => {
  beforeEach(() => {
    seed({ birth: "2000-01-01T00:00" });
  });

  it("activates a numeral typeface, persisting it and setting --num-font", async () => {
    await boot();
    document.querySelector("#gear").click();
    document.querySelector('[data-typeface="mono"]').click();

    expect(stored().typeface).toBe("mono");
    expect(
      document.documentElement.style.getPropertyValue("--num-font"),
    ).toContain("ui-monospace");

    // The re-rendered segment marks the active choice via aria-pressed.
    expect(
      document
        .querySelector('[data-typeface="mono"]')
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      document
        .querySelector('[data-typeface="system"]')
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("toggles the reflection line on and renders it on the counter", async () => {
    await boot();
    document.querySelector("#gear").click();

    const sw = document.querySelector("#reflection-switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");
    sw.click();

    expect(stored().reflection).toBe(true);
    expect(
      document.querySelector("#reflection-switch").getAttribute("aria-checked"),
    ).toBe("true");

    document.querySelector("#done").click();
    expect(document.body.className).toBe("screen-counter");
    expect(document.querySelector(".reflection")).not.toBeNull();
  });

  it("leaves the counter free of a reflection line when the toggle is off", async () => {
    await boot();
    expect(document.querySelector(".reflection")).toBeNull();
  });

  it("persists a changed birth time zone from settings", async () => {
    await boot();
    document.querySelector("#gear").click();
    const zone = document.querySelector("#settings-zone");
    zone.value = "Asia/Tokyo";
    zone.dispatchEvent(new Event("change", { bubbles: true }));
    expect(stored().birthZone).toBe("Asia/Tokyo");
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

describe("life in weeks", () => {
  it("opens the weeks grid from the counter and returns via back", async () => {
    seed({ birth: "2000-01-01T00:00", expectancy: 80 });
    await boot();
    expect(document.body.className).toBe("screen-counter");

    document.querySelector('[aria-label="Life in weeks"]').click();
    expect(document.body.className).toBe("screen-weeks");

    const WEEK_MS = 7 * DAY_MS;
    const total = 80 * 52;
    const bornMs = new Date("2000-01-01T00:00").getTime();
    const lived = Math.floor((Date.now() - bornMs) / WEEK_MS);

    const grid = document.querySelector(".weeks-grid");
    expect(grid.querySelectorAll("i").length).toBe(total);
    expect(grid.querySelectorAll("i.lived").length).toBe(lived);
    expect(grid.querySelectorAll("i.now").length).toBe(1);
    expect(grid.querySelectorAll("i.future").length).toBe(total - lived - 1);

    document.querySelector('[aria-label="Back"]').click();
    expect(document.body.className).toBe("screen-counter");
  });
});

describe("keyboard dismissal", () => {
  it("returns to the counter when Escape is pressed in the weeks view", async () => {
    seed({ birth: "2000-01-01T00:00", expectancy: 80 });
    await boot();

    document.querySelector('[aria-label="Life in weeks"]').click();
    expect(document.body.className).toBe("screen-weeks");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.className).toBe("screen-counter");
  });

  it("returns to the counter when Escape is pressed in settings", async () => {
    seed({ birth: "2000-01-01T00:00" });
    await boot();

    document.querySelector('[aria-label="Settings"]').click();
    expect(document.body.className).toBe("screen-settings");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.className).toBe("screen-counter");
  });

  it("ignores Escape on the setup screen, where there is no counter yet", async () => {
    await boot();
    expect(document.body.className).toBe("screen-setup");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.body.className).toBe("screen-setup");
  });
});
