import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderSetup, renderCounter, renderSettings } from "../src/views.js";
import { THEME_KEYS, PRESETS, cssDefault } from "../src/store.js";
import { detectZone } from "../src/time.js";
import { SUPPORTED_LANGUAGES } from "../src/i18n.js";

let app;
const detectedZone = detectZone();
beforeEach(() => {
  app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);
  for (const key of THEME_KEYS) {
    document.documentElement.style.setProperty(`--${key}`, PRESETS.Light[key]);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

function keydown(el, key) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}

describe("renderSetup", () => {
  it("renders the date, time, and start controls", () => {
    renderSetup(app, { start: vi.fn() }, null);
    expect(app.querySelector("#birth-date")).not.toBeNull();
    expect(app.querySelector("#birth-time")).not.toBeNull();
    expect(app.querySelector("#start")).not.toBeNull();
  });

  it("offers every language on first run and preserves draft fields on change", () => {
    const setLanguage = vi.fn();
    renderSetup(
      app,
      { start: vi.fn(), setLanguage },
      "1990-05-15T14:30",
      "Asia/Tokyo",
      "female",
      "us",
      "fr",
    );
    const language = app.querySelector("#setup-language");
    expect(language.value).toBe("fr");
    expect(language.options).toHaveLength(SUPPORTED_LANGUAGES.length + 1);
    expect(language.options[0].textContent).toBe("Browser default");

    language.value = "de";
    language.dispatchEvent(new Event("change", { bubbles: true }));
    expect(setLanguage).toHaveBeenCalledWith("de", {
      birth: "1990-05-15T14:30",
      birthZone: "Asia/Tokyo",
      sex: "female",
      lifeTable: "us",
    });
  });

  it("focuses the date field", () => {
    renderSetup(app, { start: vi.fn() }, null);
    expect(document.activeElement).toBe(app.querySelector("#birth-date"));
  });

  it("pre-fills date and time from an existing value", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15T14:30");
    expect(app.querySelector("#birth-date").value).toBe("1990-05-15");
    expect(app.querySelector("#birth-time").value).toBe("14:30");
  });

  it("pre-fills only the date when no time is stored", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15");
    expect(app.querySelector("#birth-date").value).toBe("1990-05-15");
    expect(app.querySelector("#birth-time").value).toBe("");
  });

  it("submits the combined date+time to start", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "2000-03-04";
    app.querySelector("#birth-time").value = "09:15";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "2000-03-04T09:15",
      detectedZone,
      null,
      "world",
    );
  });

  it("defaults an empty time to midnight", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "2010-10-10";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "2010-10-10T00:00",
      detectedZone,
      null,
      "world",
    );
  });

  it("blocks submission and reports validity when the date is empty", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    const dateEl = app.querySelector("#birth-date");
    const report = vi.spyOn(dateEl, "reportValidity").mockReturnValue(false);
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(report).toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it("submits when Enter is pressed in a field", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "1975-12-25";
    keydown(app.querySelector("#birth-date"), "Enter");
    expect(start).toHaveBeenCalledWith(
      "1975-12-25T00:00",
      detectedZone,
      null,
      "world",
    );
  });

  it("renders a birthplace time-zone combobox defaulting to the device zone", () => {
    renderSetup(app, { start: vi.fn() }, null);
    const zone = app.querySelector("#birth-zone");
    expect(zone).not.toBeNull();
    expect(zone.tagName).toBe("INPUT");
    expect(zone.getAttribute("role")).toBe("combobox");
    expect(zone.value).toContain(
      detectedZone
        .split("/")
        .map((part) => part.replaceAll("_", " "))
        .join(" / "),
    );
    // The visible label is associated with the control for accessibility.
    const label = app.querySelector('label[for="birth-zone"]');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Where were you born?");
  });

  it("pre-selects the saved birth zone when editing", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15T00:00", "Asia/Tokyo");
    expect(app.querySelector("#birth-zone").value).toBe(
      "Asia / Tokyo · UTC+09:00",
    );
  });

  it("keeps invalid zone text from replacing the selected canonical value", () => {
    const start = vi.fn();
    renderSetup(app, { start }, "1990-05-15T00:00", "Asia/Tokyo");
    const zone = app.querySelector("#birth-zone");
    zone.value = "not a zone";
    zone.dispatchEvent(new Event("input", { bubbles: true }));
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "1990-05-15T00:00",
      "Asia/Tokyo",
      null,
      "world",
    );
    expect(zone.value).toBe("Asia / Tokyo · UTC+09:00");
  });

  it("selects an open zone result with Enter without submitting setup", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null, "UTC");
    app.querySelector("#birth-date").value = "1990-05-15";
    const zone = app.querySelector("#birth-zone");
    zone.value = "tokyo";
    zone.dispatchEvent(new Event("input", { bubbles: true }));
    const enter = keydown(zone, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(start).not.toHaveBeenCalled();

    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "1990-05-15T00:00",
      "Asia/Tokyo",
      null,
      "world",
    );
  });

  it("offers an explicit actuarial baseline defaulting to World", () => {
    renderSetup(app, { start: vi.fn() }, null);
    const lifeTable = app.querySelector("#birth-life-table");
    expect(lifeTable).not.toBeNull();
    expect(lifeTable.value).toBe("world");
    expect(
      [...lifeTable.options].map(({ textContent }) => textContent),
    ).toEqual(["World — UN 2023", "United States — SSA 2023"]);
    expect(app.querySelector('label[for="birth-life-table"]').textContent).toBe(
      "Life expectancy data source",
    );
  });

  it("pre-selects a saved U.S. baseline when editing", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15T00:00", "UTC", null, "us");
    expect(app.querySelector("#birth-life-table").value).toBe("us");
  });

  it("caps the birth date at today", () => {
    renderSetup(app, { start: vi.fn() }, null);
    expect(app.querySelector("#birth-date").getAttribute("max")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("updates the maximum date for the selected birth zone", () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2024-01-01T00:30:00Z"));
    renderSetup(app, { start: vi.fn() }, null, "Asia/Tokyo");
    const date = app.querySelector("#birth-date");
    const zone = app.querySelector("#birth-zone");
    expect(date.max).toBe("2024-01-01");

    zone.value = "America/Los_Angeles";
    zone.dispatchEvent(new Event("input", { bubbles: true }));
    keydown(zone, "Enter");
    expect(date.max).toBe("2023-12-31");
    now.mockRestore();
  });

  it("rejects a birth instant that is future in the selected zone", () => {
    const now = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2024-01-01T00:30:00Z"));
    const start = vi.fn();
    renderSetup(app, { start }, null, "America/Los_Angeles");
    app.querySelector("#birth-date").value = "2023-12-31";
    app.querySelector("#birth-time").value = "23:45";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));

    expect(start).not.toHaveBeenCalled();
    expect(app.querySelector("#birth-error").hidden).toBe(false);
    now.mockRestore();
  });

  it("rejects a future birth date and surfaces an error", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "2999-01-01";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).not.toHaveBeenCalled();
    const error = app.querySelector("#birth-error");
    expect(error.hidden).toBe(false);
    expect(error.textContent.length).toBeGreaterThan(0);
  });

  it("clears the future-date error once the field is edited", () => {
    renderSetup(app, { start: vi.fn() }, null);
    const dateEl = app.querySelector("#birth-date");
    dateEl.value = "2999-01-01";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(app.querySelector("#birth-error").hidden).toBe(false);
    dateEl.value = "1990-01-01";
    dateEl.dispatchEvent(new Event("input", { bubbles: true }));
    expect(app.querySelector("#birth-error").hidden).toBe(true);
  });

  it("offers an optional sex-at-birth select defaulting to unspecified", () => {
    renderSetup(app, { start: vi.fn() }, null);
    const sex = app.querySelector("#birth-sex");
    expect(sex).not.toBeNull();
    expect(sex.tagName).toBe("SELECT");
    expect(sex.value).toBe("");
    const label = app.querySelector('label[for="birth-sex"]');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Sex at birth");
  });

  it("pre-selects the saved sex when editing", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15T00:00", "UTC", "female");
    expect(app.querySelector("#birth-sex").value).toBe("female");
  });

  it("passes the chosen sex through to start", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "1980-07-08";
    app.querySelector("#birth-sex").value = "male";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "1980-07-08T00:00",
      detectedZone,
      "male",
      "world",
    );
  });

  it("passes the chosen actuarial baseline through to start", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "1980-07-08";
    app.querySelector("#birth-life-table").value = "us";
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith(
      "1980-07-08T00:00",
      detectedZone,
      null,
      "us",
    );
  });
});

describe("renderCounter", () => {
  it("returns the elements the ticker updates", () => {
    const els = renderCounter(
      app,
      { openSettings: vi.fn(), onCycle: vi.fn() },
      { born: "Born 1 January 2000" },
    );
    expect(els.label).toBe(app.querySelector("#unit-label"));
    expect(els.count).toBe(app.querySelector("#count"));
    expect(els.progressFill).toBe(app.querySelector("#progress-fill"));
    expect(els.pct).toBe(app.querySelector("#pct"));
  });

  it("renders the born line", () => {
    renderCounter(
      app,
      { openSettings: vi.fn(), onCycle: vi.fn() },
      { born: "Born 1 January 2000" },
    );
    expect(app.querySelector(".born").textContent).toBe("Born 1 January 2000");
  });

  it("opens settings when the gear is clicked", () => {
    const openSettings = vi.fn();
    renderCounter(app, { openSettings, onCycle: vi.fn() }, { born: "" });
    app.querySelector("#gear").click();
    expect(openSettings).toHaveBeenCalledOnce();
  });

  it("cycles units on click", () => {
    const onCycle = vi.fn();
    renderCounter(app, { openSettings: vi.fn(), onCycle }, { born: "" });
    app.querySelector("#count").click();
    expect(onCycle).toHaveBeenCalledOnce();
  });

  it("cycles units on Enter and Space, but not other keys", () => {
    const onCycle = vi.fn();
    renderCounter(app, { openSettings: vi.fn(), onCycle }, { born: "" });
    const count = app.querySelector("#count");
    keydown(count, "Enter");
    keydown(count, " ");
    keydown(count, "a");
    expect(onCycle).toHaveBeenCalledTimes(2);
  });

  it("renders an SVG gear icon and a decorative unit hint", () => {
    renderCounter(
      app,
      { openSettings: vi.fn(), onCycle: vi.fn() },
      { born: "" },
    );
    expect(app.querySelector("#gear svg")).not.toBeNull();
    const hint = app.querySelector(".unit-hint");
    expect(hint).not.toBeNull();
    expect(hint.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("renderSettings", () => {
  const actions = () => ({
    setTheme: vi.fn(),
    applyPreset: vi.fn(),
    setExpectancy: vi.fn(),
    setExpectancySource: vi.fn(),
    setSex: vi.fn(),
    setLifeTable: vi.fn(),
    resetColors: vi.fn(),
    resetBirthday: vi.fn(),
    closeSettings: vi.fn(),
    setTypeface: vi.fn(),
    toggleReflection: vi.fn(),
    setZone: vi.fn(),
    setLanguage: vi.fn(),
    exportData: vi.fn(),
    importData: vi.fn(),
  });

  const data = (over = {}) => ({
    theme: null,
    expectancy: 80,
    expectancySource: "custom",
    sex: null,
    lifeTable: "world",
    estimate: 84,
    typeface: "system",
    reflection: false,
    birthZone: null,
    language: "auto",
    ...over,
  });

  it("renders one color input per theme key", () => {
    renderSettings(app, actions(), { theme: null, expectancy: 80 });
    for (const key of THEME_KEYS) {
      expect(app.querySelector(`#color-${key}`)).not.toBeNull();
    }
  });

  it("renders one swatch per preset", () => {
    renderSettings(app, actions(), { theme: null, expectancy: 80 });
    const swatches = app.querySelectorAll(".preset");
    expect(swatches.length).toBe(Object.keys(PRESETS).length);
    for (const name of Object.keys(PRESETS)) {
      expect(
        app.querySelector(`.preset[data-preset="${name}"]`),
      ).not.toBeNull();
    }
  });

  it("uses stored theme colors when present", () => {
    renderSettings(app, actions(), { theme: PRESETS.Void, expectancy: 80 });
    for (const key of THEME_KEYS) {
      expect(app.querySelector(`#color-${key}`).value).toBe(PRESETS.Void[key]);
    }
  });

  it("falls back to the CSS default color when no theme is set", () => {
    document.documentElement.style.setProperty("--bg", "#123456");
    renderSettings(app, actions(), { theme: null, expectancy: 80 });
    expect(app.querySelector("#color-bg").value).toBe(cssDefault("bg"));
    expect(app.querySelector("#color-bg").value).toBe("#123456");
  });

  it("shows the current life expectancy", () => {
    renderSettings(app, actions(), data({ expectancy: 73 }));
    expect(app.querySelector("#expectancy").value).toBe("73");
  });

  it("persists a complete palette when a color edit remains accessible", () => {
    const a = actions();
    renderSettings(app, a, data({ theme: PRESETS.Light }));
    const input = app.querySelector("#color-accent");
    input.value = "#006080";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(a.setTheme).toHaveBeenCalledWith({
      ...PRESETS.Light,
      accent: "#006080",
    });
  });

  it("blocks an inaccessible color draft until its contrast is repaired", () => {
    const a = actions();
    renderSettings(app, a, data({ theme: PRESETS.Light }));
    const input = app.querySelector("#color-count");
    input.value = "#f2f2f2";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    expect(a.setTheme).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(app.querySelector("#warn-count").hidden).toBe(false);
    expect(app.querySelector("#done").disabled).toBe(true);

    input.value = "#222222";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(a.setTheme).toHaveBeenCalledWith({
      ...PRESETS.Light,
      count: "#222222",
    });
    expect(input.getAttribute("aria-invalid")).toBe("false");
    expect(app.querySelector("#done").disabled).toBe(false);
  });

  it("applies a preset when its swatch is clicked", () => {
    const a = actions();
    renderSettings(app, a, { theme: null, expectancy: 80 });
    const name = Object.keys(PRESETS)[0];
    app.querySelector(`.preset[data-preset="${name}"]`).click();
    expect(a.applyPreset).toHaveBeenCalledWith(name);
  });

  it("reports life-expectancy edits", () => {
    const a = actions();
    renderSettings(app, a, data());
    const input = app.querySelector("#expectancy");
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(a.setExpectancy).toHaveBeenCalledWith("42");
  });

  it("wires the reset and done buttons", () => {
    const a = actions();
    renderSettings(app, a, data({ theme: PRESETS.Light }));
    app.querySelector("#reset-birthday").click();
    app.querySelector("#reset-colors").click();
    app.querySelector("#done").click();
    expect(a.resetBirthday).toHaveBeenCalledOnce();
    expect(a.resetColors).toHaveBeenCalledOnce();
    expect(a.closeSettings).toHaveBeenCalledOnce();
  });

  it("marks the preset matching the current colors as active", () => {
    renderSettings(app, actions(), { theme: PRESETS.Void, expectancy: 80 });
    const active = app.querySelector(".preset.is-active");
    expect(active).not.toBeNull();
    expect(active.dataset.preset).toBe("Void");
    expect(active.getAttribute("aria-pressed")).toBe("true");
  });

  it("warns when a guarded color fails contrast on the background", () => {
    renderSettings(app, actions(), {
      theme: {
        bg: "#ffffff",
        label: "#000000",
        count: "#f2f2f2",
        accent: "#000000",
      },
      expectancy: 80,
    });
    const note = app.querySelector("#warn-count");
    expect(note).not.toBeNull();
    expect(note.hidden).toBe(false);
    expect(
      app.querySelector("#color-count").getAttribute("aria-describedby"),
    ).toBe("warn-count");
  });

  it("keeps contrast warnings hidden when colors pass", () => {
    renderSettings(app, actions(), { theme: PRESETS.Void, expectancy: 80 });
    expect(app.querySelector("#warn-count").hidden).toBe(true);
  });

  it("renders the numeral typeface segment with the active one pressed", () => {
    renderSettings(app, actions(), data({ typeface: "mono" }));
    expect(app.querySelector(".segment")).not.toBeNull();
    expect(
      app.querySelector('[data-typeface="mono"]').getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      app
        .querySelector('[data-typeface="system"]')
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("preselects the language and reports changes", () => {
    const a = actions();
    renderSettings(app, a, data({ language: "fr" }));
    const language = app.querySelector("#settings-language");
    expect(language.value).toBe("fr");
    expect(language.options).toHaveLength(SUPPORTED_LANGUAGES.length + 1);
    language.value = "ja";
    language.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setLanguage).toHaveBeenCalledWith("ja");
  });

  it("reports typeface changes when a segment button is clicked", () => {
    const a = actions();
    renderSettings(app, a, data());
    app.querySelector('[data-typeface="grotesk"]').click();
    expect(a.setTypeface).toHaveBeenCalledWith("grotesk");
  });

  it("reflects the reflection setting on the switch and toggles it", () => {
    const a = actions();
    renderSettings(app, a, data({ reflection: true }));
    const sw = app.querySelector("#reflection-switch");
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("true");
    sw.click();
    expect(a.toggleReflection).toHaveBeenCalledOnce();
  });

  it("preselects the birth zone and reports zone changes", () => {
    const a = actions();
    renderSettings(app, a, data({ birthZone: "Asia/Tokyo" }));
    const zone = app.querySelector("#settings-zone");
    expect(zone.value).toBe("Asia / Tokyo · UTC+09:00");
    zone.value = "new york";
    zone.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector('[role="option"]').click();
    expect(a.setZone).toHaveBeenCalledOnce();
    expect(a.setZone).toHaveBeenCalledWith("America/New_York");
  });

  it("cleans up an open zone popup before settings re-render", () => {
    const abort = vi.spyOn(AbortController.prototype, "abort");
    renderSettings(app, actions(), data({ birthZone: "Asia/Tokyo" }));
    const input = app.querySelector("#settings-zone");
    keydown(input, "ArrowDown");
    renderSettings(app, actions(), data({ birthZone: "Asia/Tokyo" }));
    expect(abort).toHaveBeenCalledOnce();
    expect(document.querySelectorAll(".search-select-popup")).toHaveLength(1);
  });

  it("keeps IANA options left-to-right in an RTL document", () => {
    document.documentElement.dir = "rtl";
    renderSettings(app, actions(), data({ birthZone: "Asia/Tokyo" }));
    const input = app.querySelector("#settings-zone");
    keydown(input, "ArrowDown");
    expect(input.dir).toBe("ltr");
    expect(document.querySelector(".search-select-popup").dir).toBe("rtl");
    expect(document.querySelector('[role="option"]').dir).toBe("ltr");
  });

  it("wires the data export and import buttons", () => {
    const a = actions();
    renderSettings(app, a, data());
    app.querySelector("#export-data").click();
    app.querySelector("#import-data").click();
    expect(a.exportData).toHaveBeenCalledOnce();
    expect(a.importData).toHaveBeenCalledOnce();
  });

  it("provides a hidden live alert for import failures", () => {
    renderSettings(app, actions(), data());
    const status = app.querySelector("#import-status");
    expect(status.hidden).toBe(true);
    expect(status.getAttribute("role")).toBe("alert");
    expect(
      app.querySelector("#import-data").getAttribute("aria-describedby"),
    ).toBe("import-status");
  });

  it("renders the expectancy source segment reflecting the current source", () => {
    renderSettings(app, actions(), data({ expectancySource: "custom" }));
    expect(
      app.querySelector('[data-source="custom"]').getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      app
        .querySelector('[data-source="estimate"]')
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("shows the editable Years input and no estimate line in custom mode", () => {
    renderSettings(app, actions(), data({ expectancySource: "custom" }));
    expect(app.querySelector("#expectancy")).not.toBeNull();
    expect(app.querySelector("#expectancy-estimate")).toBeNull();
    expect(app.querySelector("#settings-life-table")).toBeNull();
    expect(app.querySelector("#settings-sex")).toBeNull();
  });

  it("hides the Years input and previews the estimate in estimate mode", () => {
    renderSettings(
      app,
      actions(),
      data({ expectancySource: "estimate", estimate: 84 }),
    );
    expect(app.querySelector("#expectancy")).toBeNull();
    const line = app.querySelector("#expectancy-estimate");
    expect(line).not.toBeNull();
    expect(line.textContent).toContain("84");
    expect(line.textContent).toContain("based on your age");
  });

  it("prompts for a birthday when no estimate is available", () => {
    renderSettings(
      app,
      actions(),
      data({ expectancySource: "estimate", estimate: null }),
    );
    expect(app.querySelector("#expectancy-estimate").textContent).toContain(
      "Add your birthday",
    );
  });

  it("reports source changes when a segment button is clicked", () => {
    const a = actions();
    renderSettings(app, a, data({ expectancySource: "custom" }));
    app.querySelector('[data-source="estimate"]').click();
    expect(a.setExpectancySource).toHaveBeenCalledWith("estimate");
  });

  it("preselects the stored sex and reports changes, mapping blank to null", () => {
    const a = actions();
    renderSettings(
      app,
      a,
      data({ expectancySource: "estimate", sex: "female" }),
    );
    const sex = app.querySelector("#settings-sex");
    expect(sex.value).toBe("female");
    sex.value = "male";
    sex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setSex).toHaveBeenCalledWith("male");
    sex.value = "";
    sex.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setSex).toHaveBeenCalledWith(null);
  });

  it("preselects and reports the life-expectancy data source", () => {
    const a = actions();
    renderSettings(
      app,
      a,
      data({ expectancySource: "estimate", lifeTable: "us" }),
    );
    const lifeTable = app.querySelector("#settings-life-table");
    expect(
      app.querySelector('label[for="settings-life-table"]').textContent,
    ).toBe("Data source");
    expect(lifeTable.value).toBe("us");
    lifeTable.value = "world";
    lifeTable.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setLifeTable).toHaveBeenCalledWith("world");
  });
});
