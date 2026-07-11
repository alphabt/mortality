import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  THEME_KEYS,
  MODES,
  PRESETS,
  TYPEFACES,
  load,
  save,
  cssDefault,
  bestOnColor,
  applyTheme,
  applyTypeface,
  clampExpectancy,
  effectiveExpectancy,
  normalizeTheme,
} from "../src/store.js";

// Independent WCAG contrast implementation, used to verify the PRESETS meet the
// accessibility promise documented in store.js (not imported from the module —
// this is the check, not the thing under test).
function luminance(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TAB_CSS = readFileSync(resolve(process.cwd(), "src/tab.css"), "utf8");

describe("constants", () => {
  it("exposes the four themeable keys", () => {
    expect(THEME_KEYS).toEqual(["bg", "label", "count", "accent"]);
  });

  it("exposes the counter display modes", () => {
    expect(MODES).toEqual([
      "years",
      "calendar",
      "birthday",
      "days",
      "weeks",
      "yearsLeft",
      "daysLeft",
      "weeksLeft",
    ]);
  });

  it("exposes the selectable numeral typefaces", () => {
    expect(TYPEFACES).toEqual(["system", "grotesk", "mono"]);
  });

  it("every preset defines a hex value for every theme key", () => {
    const names = Object.keys(PRESETS);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      const preset = PRESETS[name];
      expect(Object.keys(preset).sort()).toEqual([...THEME_KEYS].sort());
      for (const key of THEME_KEYS) {
        expect(preset[key]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("PRESETS accessibility invariants", () => {
  // The store.js comment guarantees count & label ≥4.5:1 on bg and accent ≥3:1.
  for (const [name, preset] of Object.entries(PRESETS)) {
    it(`${name}: text is legible and accent is distinguishable on its background`, () => {
      expect(contrast(preset.count, preset.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(preset.label, preset.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(preset.accent, preset.bg)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("Light and Dark presets mirror the stylesheet defaults", () => {
  // These two presets duplicate the tab.css defaults so the shipped light and
  // dark looks are selectable. This fails if either drifts out of sync.
  function parseVars(body) {
    const vars = {};
    for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim().toLowerCase();
    }
    return vars;
  }

  const rootVars = parseVars(TAB_CSS.match(/:root\s*\{([^}]*)\}/)[1]);
  const darkVars = parseVars(
    TAB_CSS.match(
      /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([^}]*)\}/,
    )[1],
  );

  it("Light matches the base :root theme keys", () => {
    for (const key of THEME_KEYS) {
      expect(PRESETS.Light[key].toLowerCase()).toBe(rootVars[key]);
    }
  });

  it("Dark matches the prefers-color-scheme: dark theme keys", () => {
    for (const key of THEME_KEYS) {
      // Dark inherits any key it doesn't override from :root (e.g. accent).
      expect(PRESETS.Dark[key].toLowerCase()).toBe(
        darkVars[key] ?? rootVars[key],
      );
    }
  });
});

describe("stylesheet accessibility invariants", () => {
  it("keeps interactive controls at least 44px in both dimensions", () => {
    const sharedControls = TAB_CSS.match(/input,\s*button\s*\{([^}]*)\}/)[1];
    const selects = TAB_CSS.match(/select\s*\{([^}]*)\}/)[1];
    for (const rules of [sharedControls, selects]) {
      expect(rules).toContain("min-width: 2.75rem");
      expect(rules).toContain("min-height: 2.75rem");
    }
  });

  it("does not fade readable text or introduce shadow elevation", () => {
    const fraction = TAB_CSS.match(/\.count \.fraction\s*\{([^}]*)\}/)[1];
    const reflection = TAB_CSS.match(/\.reflection\s*\{([^}]*)\}/)[1];
    expect(fraction).toContain("color: var(--count)");
    expect(reflection).toContain("color: var(--label)");
    expect(TAB_CSS).not.toMatch(
      /(?:-webkit-)?mask-image|box-shadow|\.count:hover\s*\{|filter:/,
    );
  });

  it("keeps localized birthday quantities intact and centers the RTL switch", () => {
    const quantity = TAB_CSS.match(/\.count \.cal-part\s*\{([^}]*)\}/)[1];
    const birthday = TAB_CSS.match(/\.count\.birthday-count\s*\{([^}]*)\}/)[1];
    const switchTrack = TAB_CSS.match(/\.switch::before\s*\{([^}]*)\}/)[1];
    expect(quantity).toContain("white-space: nowrap");
    expect(birthday).toContain("flex-wrap: wrap");
    expect(switchTrack).toContain("left: 50%");
    expect(switchTrack).not.toContain("inset-inline-start");
  });
});

describe("bestOnColor", () => {
  it("picks white ink on very dark fills", () => {
    expect(bestOnColor("#000000")).toBe("#ffffff");
    expect(bestOnColor("#0a0a0a")).toBe("#ffffff");
  });

  it("picks dark ink on very light fills", () => {
    expect(bestOnColor("#ffffff")).toBe("#141414");
    expect(bestOnColor("#fafaf8")).toBe("#141414");
  });

  it("always returns normal-text contrast for accepted accents", () => {
    for (const accent of [
      ...Object.values(PRESETS).map(({ accent }) => accent),
      "#7a7a7a",
    ]) {
      expect(contrast(bestOnColor(accent), accent)).toBeGreaterThanOrEqual(4.5);
    }
    expect(bestOnColor("#7a7a7a")).toBe("#000000");
  });
});

describe("cssDefault", () => {
  it("reads an inline custom property off the document root", () => {
    document.documentElement.style.setProperty("--accent", "#5cc2ea");
    expect(cssDefault("accent")).toBe("#5cc2ea");
  });

  it("falls back to black when the property is unset", () => {
    expect(cssDefault("accent")).toBe("#000000");
  });
});

describe("applyTheme", () => {
  it("writes each provided color as an inline custom property", () => {
    applyTheme(PRESETS.Void);
    const root = document.documentElement;
    for (const key of THEME_KEYS) {
      expect(root.style.getPropertyValue(`--${key}`)).toBe(PRESETS.Void[key]);
    }
  });

  it("derives --on-accent from the effective accent", () => {
    applyTheme(PRESETS.Void);
    expect(document.documentElement.style.getPropertyValue("--on-accent")).toBe(
      bestOnColor(PRESETS.Void.accent),
    );
  });

  it("uses the accessible accent as the focus color", () => {
    applyTheme(PRESETS.Void);
    expect(document.documentElement.style.getPropertyValue("--focus")).toBe(
      PRESETS.Void.accent,
    );
  });

  it("rejects a partial theme instead of applying unsafe overrides", () => {
    applyTheme(PRESETS.Void);
    applyTheme({ accent: "#123456" });
    const root = document.documentElement;
    for (const key of THEME_KEYS) {
      expect(root.style.getPropertyValue(`--${key}`)).toBe("");
    }
    expect(root.style.getPropertyValue("--focus")).toBe("");
  });

  it("clears all overrides and focus when passed null", () => {
    applyTheme(PRESETS.Amber);
    applyTheme(null);
    const root = document.documentElement;
    for (const key of THEME_KEYS) {
      expect(root.style.getPropertyValue(`--${key}`)).toBe("");
    }
    expect(root.style.getPropertyValue("--focus")).toBe("");
    // cssDefault('accent') is now "#000000", whose best ink is white.
    expect(root.style.getPropertyValue("--on-accent")).toBe("#ffffff");
  });
});

describe("normalizeTheme", () => {
  it("expands shorthand hex values in a complete accessible palette", () => {
    expect(
      normalizeTheme({
        bg: "#111",
        label: "#aaa",
        count: "#fff",
        accent: "#f00",
      }),
    ).toEqual({
      bg: "#111111",
      label: "#aaaaaa",
      count: "#ffffff",
      accent: "#ff0000",
    });
  });

  it("rejects partial, malformed, and insufficient-contrast palettes", () => {
    expect(normalizeTheme({ accent: "#007ea6" })).toBeNull();
    expect(
      normalizeTheme({
        bg: "white",
        label: "#111111",
        count: "#111111",
        accent: "#007ea6",
      }),
    ).toBeNull();
    expect(
      normalizeTheme({
        bg: "#ffffff",
        label: "#eeeeee",
        count: "#111111",
        accent: "#007ea6",
      }),
    ).toBeNull();
  });
});

describe("applyTypeface", () => {
  it("sets a monospace stack for the mono typeface", () => {
    applyTypeface("mono");
    expect(
      document.documentElement.style.getPropertyValue("--num-font"),
    ).toContain("ui-monospace");
  });

  it("sets a grotesk stack for the grotesk typeface", () => {
    applyTypeface("grotesk");
    expect(
      document.documentElement.style.getPropertyValue("--num-font"),
    ).toContain("Avenir Next");
  });

  it("removes the property for the system typeface", () => {
    applyTypeface("mono");
    applyTypeface("system");
    expect(document.documentElement.style.getPropertyValue("--num-font")).toBe(
      "",
    );
  });

  it("removes the property for any unknown typeface", () => {
    applyTypeface("grotesk");
    applyTypeface("wingdings");
    expect(document.documentElement.style.getPropertyValue("--num-font")).toBe(
      "",
    );
  });
});

describe("save / load with the localStorage fallback", () => {
  it("returns defaults when nothing is stored", async () => {
    await expect(load()).resolves.toEqual({
      version: 1,
      birth: null,
      birthZone: null,
      theme: null,
      expectancy: 80,
      expectancySource: "estimate",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });

  it("normalizes a saved accessible theme on load", async () => {
    const state = {
      version: 1,
      birth: "2000-01-01T06:30",
      birthZone: "America/New_York",
      theme: { bg: "#111111", label: "#aaa", count: "#fff", accent: "#f00" },
      expectancy: 70,
      expectancySource: "custom",
      sex: "female",
      lifeTable: "us",
      mode: "days",
      typeface: "mono",
      reflection: true,
      language: "fr",
    };
    await save(state);
    await expect(load()).resolves.toEqual({
      ...state,
      theme: {
        bg: "#111111",
        label: "#aaaaaa",
        count: "#ffffff",
        accent: "#ff0000",
      },
    });
  });

  it("falls back to the system theme for an invalid stored palette", async () => {
    await save({
      birth: "2000-01-01T00:00",
      birthZone: "UTC",
      theme: {
        bg: "#ffffff",
        label: "#eeeeee",
        count: "#ffffff",
        accent: "#eeeeee",
      },
    });
    await expect(load()).resolves.toMatchObject({ theme: null });
  });

  it("clears malformed and future stored birthdays", async () => {
    for (const birth of ["not-a-date", "2999-01-01T00:00"]) {
      await save({ birth, birthZone: "UTC" });
      await expect(load()).resolves.toMatchObject({
        birth: null,
        birthZone: null,
      });
    }
  });

  it("merges stored partial state over the defaults", async () => {
    await save({ birth: "1990-05-15T00:00", birthZone: "Asia/Tokyo" });
    await expect(load()).resolves.toEqual({
      version: 1,
      birth: "1990-05-15T00:00",
      birthZone: "Asia/Tokyo",
      theme: null,
      expectancy: 80,
      // A record already on disk that predates the estimate feature is pinned to
      // "custom" so its flat number never silently changes on update.
      expectancySource: "custom",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });

  it("backfills birthZone with the detected zone for pre-zone records", async () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await save({ birth: "1990-05-15T00:00" });
    const result = await load();
    expect(result.birthZone).toBe(detected);
    // The backfill is persisted, so it stays stable on subsequent loads.
    await expect(load()).resolves.toMatchObject({ birthZone: detected });
  });

  it("replaces an invalid stored birth zone with one stable fallback", async () => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await save({
      birth: "1990-05-15T00:00",
      birthZone: "Mars/Olympus",
    });
    await expect(load()).resolves.toMatchObject({
      birth: "1990-05-15T00:00",
      birthZone: detected,
    });
    await expect(load()).resolves.toMatchObject({ birthZone: detected });
  });

  it("leaves birthZone null when there is no birth to anchor", async () => {
    await save({ expectancy: 66 });
    await expect(load()).resolves.toMatchObject({
      birth: null,
      birthZone: null,
      expectancy: 66,
    });
  });

  it("migrates the legacy `dob` string on first run", async () => {
    localStorage.setItem("dob", "1985-07-20");
    const result = await load();
    expect(result.birth).toBe("1985-07-20");
    expect(result.expectancy).toBe(80);
    expect(result.mode).toBe("years");
    // Migrated data is now persisted under the primary key.
    const persisted = await load();
    expect(persisted.birth).toBe("1985-07-20");
  });

  it("ignores malformed stored JSON and returns defaults", async () => {
    localStorage.setItem("mortality", "not-json{{{");
    await expect(load()).resolves.toEqual({
      version: 1,
      birth: null,
      birthZone: null,
      theme: null,
      expectancy: 80,
      expectancySource: "estimate",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });

  it.each(["corrupt-root", [], 42])(
    "repairs a malformed persisted root: %j",
    async (root) => {
      await save(root);
      await expect(load()).resolves.toMatchObject({
        version: 1,
        birth: null,
        birthZone: null,
        theme: null,
        expectancySource: "estimate",
      });
      const repaired = JSON.parse(localStorage.getItem("mortality"));
      expect(repaired).toMatchObject({
        version: 1,
        birth: null,
        birthZone: null,
      });
      expect(Array.isArray(repaired)).toBe(false);
    },
  );

  it("swallows write failures (private mode / quota) without throwing", async () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    await expect(save({ birth: "2000-01-01T00:00" })).resolves.toBeUndefined();
  });

  it("survives storage reads that throw and falls back to defaults", async () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await expect(load()).resolves.toEqual({
      version: 1,
      birth: null,
      birthZone: null,
      theme: null,
      expectancy: 80,
      expectancySource: "estimate",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });
});

describe("expectancy-source migration", () => {
  it("defaults a brand-new install to the actuarial estimate source", async () => {
    const result = await load();
    expect(result.expectancySource).toBe("estimate");
    expect(result.sex).toBe(null);
    expect(result.lifeTable).toBe("world");
  });

  it("pins a pre-existing record without a source to custom", async () => {
    // A record already on disk (pre-feature) keeps its flat number verbatim.
    await save({ birth: "1980-01-01T00:00", birthZone: "UTC", expectancy: 66 });
    const result = await load();
    expect(result.expectancySource).toBe("custom");
    expect(result.expectancy).toBe(66);
    expect(result.sex).toBe(null);
    expect(result.lifeTable).toBe("world");
  });

  it("preserves an explicit estimate source on an existing record", async () => {
    await save({
      birth: "1980-01-01T00:00",
      birthZone: "UTC",
      expectancySource: "estimate",
      sex: "female",
      lifeTable: "us",
    });

    const result = await load();
    expect(result.expectancySource).toBe("estimate");
    expect(result.sex).toBe("female");
    expect(result.lifeTable).toBe("us");
  });

  it("preserves a valid generated UN country source", async () => {
    await save({
      birth: "1980-01-01T00:00",
      birthZone: "UTC",
      expectancySource: "estimate",
      sex: "female",
      lifeTable: "un:392",
    });
    await expect(load()).resolves.toMatchObject({
      expectancySource: "estimate",
      sex: "female",
      lifeTable: "un:392",
    });
  });

  it("migrates the legacy dob record to a custom source", async () => {
    localStorage.setItem("dob", "1970-01-01");
    const result = await load();
    expect(result.expectancySource).toBe("custom");
    expect(result.sex).toBe(null);
    expect(result.lifeTable).toBe("world");
  });

  it("persists the migration so it stays stable on the next load", async () => {
    await save({ birth: "1980-01-01T00:00", birthZone: "UTC", expectancy: 72 });
    await load();
    const persisted = JSON.parse(localStorage.getItem("mortality"));
    expect(persisted.expectancySource).toBe("custom");
    expect(persisted.sex).toBe(null);
    expect(persisted.lifeTable).toBe("world");
  });

  it("normalizes an unknown stored life table to World", async () => {
    await save({
      birth: "1980-01-01T00:00",
      birthZone: "UTC",
      expectancySource: "estimate",
      lifeTable: "timezone-derived",
    });
    const result = await load();
    expect(result.lifeTable).toBe("world");
  });

  it("never infers an actuarial baseline from the birth time zone", async () => {
    await save({
      birth: "1980-01-01T00:00",
      birthZone: "America/New_York",
      expectancySource: "estimate",
    });
    const result = await load();
    expect(result.lifeTable).toBe("world");
  });
});

describe("effectiveExpectancy", () => {
  it("honours a custom number verbatim, clamped to range", () => {
    expect(
      effectiveExpectancy({ expectancySource: "custom", expectancy: 70 }, 40),
    ).toBe(70);
    expect(
      effectiveExpectancy({ expectancySource: "custom", expectancy: 999 }, 40),
    ).toBe(150);
  });

  it("derives an actuarial estimate from age and sex when set to estimate", () => {
    const male = effectiveExpectancy(
      { expectancySource: "estimate", sex: "male", expectancy: 80 },
      70,
    );
    const female = effectiveExpectancy(
      { expectancySource: "estimate", sex: "female", expectancy: 80 },
      70,
    );
    expect(Number.isInteger(male)).toBe(true);
    expect(male).toBeGreaterThanOrEqual(70); // never below current age
    expect(female).toBeGreaterThanOrEqual(male); // female >= male
  });

  it("derives an estimate from a generated country table", () => {
    expect(
      effectiveExpectancy(
        {
          expectancySource: "estimate",
          expectancy: 80,
          sex: "male",
          lifeTable: "un:392",
        },
        0,
      ),
    ).toBe(82);
  });

  it("uses the explicitly selected actuarial baseline", () => {
    const world = effectiveExpectancy(
      {
        expectancySource: "estimate",
        sex: "male",
        lifeTable: "world",
        expectancy: 80,
      },
      40,
    );
    const us = effectiveExpectancy(
      {
        expectancySource: "estimate",
        sex: "male",
        lifeTable: "us",
        expectancy: 80,
      },
      40,
    );
    expect(world).not.toBe(us);
    expect(us).toBeGreaterThan(world);
  });

  it("falls back to the clamped custom value when the age is unavailable", () => {
    expect(
      effectiveExpectancy(
        { expectancySource: "estimate", expectancy: 66, sex: "male" },
        NaN,
      ),
    ).toBe(66);
  });
});

describe("clampExpectancy", () => {
  it("clamps into the supported [1, 150] whole-year band", () => {
    expect(clampExpectancy(80)).toBe(80);
    expect(clampExpectancy(0)).toBe(1);
    expect(clampExpectancy(999)).toBe(150);
    expect(clampExpectancy("abc")).toBe(80);
  });
});

describe("save / load against extension storage", () => {
  let storageMock;

  async function importFreshStore() {
    vi.resetModules();
    return import("../src/store.js");
  }

  beforeEach(() => {
    storageMock = {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
    };
    vi.stubGlobal("chrome", { storage: { local: storageMock } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("save writes the state under the `mortality` key", async () => {
    const store = await importFreshStore();
    const state = { version: 1, birth: "2001-02-03T00:00", expectancy: 88 };
    await store.save(state);
    expect(storageMock.set).toHaveBeenCalledWith({ mortality: state });
  });

  it("keeps write failures observable while handling unawaited rejections", async () => {
    const failure = new Error("storage unavailable");
    storageMock.set.mockRejectedValueOnce(failure);
    const store = await importFreshStore();

    await expect(store.save({ mode: "years" })).rejects.toBe(failure);
  });

  it("serializes unawaited extension writes so an older save cannot finish last", async () => {
    const releases = [];
    storageMock.set.mockImplementation(
      () => new Promise((resolve) => releases.push(resolve)),
    );
    const store = await importFreshStore();
    const first = store.save({ mode: "years" });
    const second = store.save({ mode: "weeks" });

    expect(storageMock.set).toHaveBeenCalledTimes(1);
    expect(storageMock.set).toHaveBeenLastCalledWith({
      mortality: { mode: "years" },
    });
    releases.shift()();
    await first;
    await Promise.resolve();
    expect(storageMock.set).toHaveBeenCalledTimes(2);
    expect(storageMock.set).toHaveBeenLastCalledWith({
      mortality: { mode: "weeks" },
    });
    releases.shift()();
    await second;
  });

  it("load reads existing state from extension storage", async () => {
    storageMock.get.mockResolvedValue({
      mortality: {
        birth: "1999-09-09T00:00",
        birthZone: "Europe/London",
        expectancy: 95,
      },
    });
    const store = await importFreshStore();
    const result = await store.load();
    expect(storageMock.get).toHaveBeenCalledWith("mortality");
    expect(result).toEqual({
      version: 1,
      birth: "1999-09-09T00:00",
      birthZone: "Europe/London",
      theme: null,
      expectancy: 95,
      expectancySource: "custom",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });

  it("migrates a legacy localStorage blob into extension storage and clears it", async () => {
    localStorage.setItem(
      "mortality",
      JSON.stringify({ birth: "1988-01-02T03:04", expectancy: 90 }),
    );
    localStorage.setItem("dob", "1988-01-02");
    const store = await importFreshStore();

    const result = await store.load();

    expect(result.birth).toBe("1988-01-02T03:04");
    expect(result.expectancy).toBe(90);
    expect(storageMock.set).toHaveBeenCalledWith({
      mortality: expect.objectContaining({
        birth: "1988-01-02T03:04",
        expectancy: 90,
      }),
    });
    // Now that the real store owns the data, the legacy keys are gone.
    expect(localStorage.getItem("mortality")).toBe(null);
    expect(localStorage.getItem("dob")).toBe(null);
  });

  it("falls back to defaults when extension storage rejects", async () => {
    storageMock.get.mockRejectedValue(new Error("boom"));
    const store = await importFreshStore();
    await expect(store.load()).resolves.toEqual({
      version: 1,
      birth: null,
      birthZone: null,
      theme: null,
      expectancy: 80,
      expectancySource: "estimate",
      sex: null,
      lifeTable: "world",
      mode: "years",
      typeface: "system",
      reflection: false,
      language: "auto",
    });
  });
});
