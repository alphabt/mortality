import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderSetup, renderCounter, renderSettings } from "../src/views.js";
import { THEME_KEYS, PRESETS, cssDefault } from "../src/store.js";

let app;
beforeEach(() => {
  app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);
});

function keydown(el, key) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("renderSetup", () => {
  it("renders the date, time, and start controls", () => {
    renderSetup(app, { start: vi.fn() }, null);
    expect(app.querySelector("#birth-date")).not.toBeNull();
    expect(app.querySelector("#birth-time")).not.toBeNull();
    expect(app.querySelector("#start")).not.toBeNull();
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
    const zone = app.querySelector("#birth-zone").value;
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith("2000-03-04T09:15", zone);
  });

  it("defaults an empty time to midnight", () => {
    const start = vi.fn();
    renderSetup(app, { start }, null);
    app.querySelector("#birth-date").value = "2010-10-10";
    const zone = app.querySelector("#birth-zone").value;
    app
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    expect(start).toHaveBeenCalledWith("2010-10-10T00:00", zone);
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
    const zone = app.querySelector("#birth-zone").value;
    keydown(app.querySelector("#birth-date"), "Enter");
    expect(start).toHaveBeenCalledWith("1975-12-25T00:00", zone);
  });

  it("renders a birthplace time-zone select defaulting to the device zone", () => {
    renderSetup(app, { start: vi.fn() }, null);
    const zone = app.querySelector("#birth-zone");
    expect(zone).not.toBeNull();
    expect(zone.tagName).toBe("SELECT");
    expect(zone.value).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    // The visible label is associated with the control for accessibility.
    const label = app.querySelector('label[for="birth-zone"]');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe("Where were you born?");
  });

  it("pre-selects the saved birth zone when editing", () => {
    renderSetup(app, { start: vi.fn() }, "1990-05-15T00:00", "Asia/Tokyo");
    expect(app.querySelector("#birth-zone").value).toBe("Asia/Tokyo");
  });

  it("caps the birth date at today", () => {
    renderSetup(app, { start: vi.fn() }, null);
    expect(app.querySelector("#birth-date").getAttribute("max")).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
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
    setColor: vi.fn(),
    applyPreset: vi.fn(),
    setExpectancy: vi.fn(),
    resetColors: vi.fn(),
    resetBirthday: vi.fn(),
    closeSettings: vi.fn(),
    setTypeface: vi.fn(),
    toggleReflection: vi.fn(),
    setZone: vi.fn(),
    exportData: vi.fn(),
    importData: vi.fn(),
  });

  const data = (over = {}) => ({
    theme: null,
    expectancy: 80,
    typeface: "system",
    reflection: false,
    birthZone: null,
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
    renderSettings(app, actions(), { theme: null, expectancy: 73 });
    expect(app.querySelector("#expectancy").value).toBe("73");
  });

  it("reports color edits with key and value", () => {
    const a = actions();
    renderSettings(app, a, { theme: null, expectancy: 80 });
    const input = app.querySelector("#color-accent");
    input.value = "#abcdef";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(a.setColor).toHaveBeenCalledWith("accent", "#abcdef");
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
    renderSettings(app, a, { theme: null, expectancy: 80 });
    const input = app.querySelector("#expectancy");
    input.value = "42";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(a.setExpectancy).toHaveBeenCalledWith("42");
  });

  it("wires the reset and done buttons", () => {
    const a = actions();
    renderSettings(app, a, { theme: null, expectancy: 80 });
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
    expect(zone.value).toBe("Asia/Tokyo");
    const other = [...zone.options]
      .map((o) => o.value)
      .find((v) => v !== zone.value);
    zone.value = other;
    zone.dispatchEvent(new Event("change", { bubbles: true }));
    expect(a.setZone).toHaveBeenCalledWith(other);
  });

  it("wires the data export and import buttons", () => {
    const a = actions();
    renderSettings(app, a, data());
    app.querySelector("#export-data").click();
    app.querySelector("#import-data").click();
    expect(a.exportData).toHaveBeenCalledOnce();
    expect(a.importData).toHaveBeenCalledOnce();
  });
});
