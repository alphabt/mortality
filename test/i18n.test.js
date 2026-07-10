import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTOMATIC_LANGUAGE,
  EN_MESSAGES,
  SUPPORTED_LANGUAGES,
  activateLanguage,
  applyDocumentLocale,
  formatDate,
  formatFixedParts,
  formatList,
  formatNumber,
  formatPercent,
  formatUnit,
  formatUnitParts,
  getDirection,
  getLocale,
  languageName,
  msg,
  normalizeLanguage,
  regionName,
  compareLocaleText,
} from "../src/i18n.js";
import { buildLifeTableOptions } from "../src/life-table-options.js";
import { filterSearchOptions } from "../src/search-select.js";
import { renderSetup } from "../src/views.js";
import { formatBorn } from "../src/tab.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCALES = [
  "ar",
  "am",
  "bg",
  "bn",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "en_AU",
  "en_GB",
  "en_US",
  "es",
  "es_419",
  "et",
  "fa",
  "fi",
  "fil",
  "fr",
  "gu",
  "he",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "ja",
  "kn",
  "ko",
  "lt",
  "lv",
  "ml",
  "mr",
  "ms",
  "nl",
  "no",
  "pl",
  "pt_BR",
  "pt_PT",
  "ro",
  "ru",
  "sk",
  "sl",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh_CN",
  "zh_TW",
];

function catalog(locale) {
  return JSON.parse(
    readFileSync(
      join(ROOT, "src", "_locales", locale, "messages.json"),
      "utf8",
    ),
  );
}

function placeholderTokens(message) {
  return [...message.matchAll(/\$([A-Za-z][A-Za-z0-9_]*)\$/g)]
    .map((match) => match[1].toLowerCase())
    .sort();
}

function mockLocale(locale, messages = {}) {
  vi.stubGlobal("browser", undefined);
  vi.stubGlobal("chrome", {
    i18n: {
      getUILanguage: () => locale,
      getMessage: (key, substitutions) => {
        if (key.startsWith("@@")) return "";
        const value = messages[key];
        return typeof value === "function"
          ? value(
              Array.isArray(substitutions) ? substitutions : [substitutions],
            )
          : value || "";
      },
    },
  });
}

afterEach(async () => {
  await activateLanguage(AUTOMATIC_LANGUAGE);
  vi.unstubAllGlobals();
  document.documentElement.lang = "en";
  document.documentElement.removeAttribute("dir");
  document.title = "";
});

describe("locale catalogs", () => {
  const english = catalog("en");
  const englishKeys = Object.keys(english).sort();

  it("ships exactly the 55 official Chrome WebExtension locales", () => {
    const actual = readdirSync(join(ROOT, "src", "_locales")).sort();
    expect(actual).toEqual([...LOCALES].sort());
    expect([...SUPPORTED_LANGUAGES].sort()).toEqual([...LOCALES].sort());
  });

  it.each(LOCALES)(
    "%s has exact keys, messages, and placeholder parity",
    (locale) => {
      const translated = catalog(locale);
      expect(Object.keys(translated).sort()).toEqual(englishKeys);
      expect(translated.extName.message).toBe("Mortality");
      expect(translated.extDescription.message.trim()).not.toBe("");

      for (const key of englishKeys) {
        expect(translated[key].message.trim(), `${locale}.${key}`).not.toBe("");
        const expectedPlaceholders = english[key].placeholders ?? {};
        const actualPlaceholders = translated[key].placeholders ?? {};
        expect(
          Object.keys(actualPlaceholders).sort(),
          `${locale}.${key}`,
        ).toEqual(Object.keys(expectedPlaceholders).sort());
        for (const name of Object.keys(expectedPlaceholders)) {
          expect(
            actualPlaceholders[name].content,
            `${locale}.${key}.${name}`,
          ).toBe(expectedPlaceholders[name].content);
        }
        expect(
          placeholderTokens(translated[key].message),
          `${locale}.${key}`,
        ).toEqual(
          Object.keys(actualPlaceholders)
            .map((name) => name.toLowerCase())
            .sort(),
        );
      }
    },
  );

  it("keeps the production English fallback in exact catalog parity", () => {
    expect(Object.keys(EN_MESSAGES).sort()).toEqual(englishKeys);
    for (const key of englishKeys) {
      expect(EN_MESSAGES[key]).toBe(english[key].message);
    }
  });

  it("uses plain data-source language and removes the superseded copy", () => {
    expect({
      actuarialBaseline: EN_MESSAGES.actuarialBaseline,
      baselineSetupHint: EN_MESSAGES.baselineSetupHint,
      baseline: EN_MESSAGES.baseline,
      estimateLine: EN_MESSAGES.estimateLine,
      estimateMissing: EN_MESSAGES.estimateMissing,
      baselineSettingsHint: EN_MESSAGES.baselineSettingsHint,
    }).toEqual({
      actuarialBaseline: "Life expectancy data source",
      baselineSetupHint:
        "World data by default. Your time zone never changes this choice.",
      baseline: "Data source",
      estimateLine: "≈ $YEARS$ years — based on your age and selected data.",
      estimateMissing: "Add your birthday to see an estimate.",
      baselineSettingsHint:
        "Your time zone never changes the data source. Sex at birth is optional.",
    });

    const superseded = [
      "Actuarial baseline",
      "World by default. Chosen explicitly — never inferred from your time zone.",
      "Baseline",
      "≈ $YEARS$ years — actuarial estimate for your age.",
      "Add your birthday to see an actuarial estimate.",
      "Baseline is never inferred from your time zone. Sex at birth is optional.",
    ];
    const descriptionKeys = [
      "actuarialBaseline",
      "baselineSetupHint",
      "baseline",
      "lifeTableWorld",
      "lifeTableUS",
      "baselineSettingsHint",
      "estimateLine",
      "estimateMissing",
    ];
    for (const locale of LOCALES) {
      const translated = catalog(locale);
      const messages = Object.values(translated).map(({ message }) => message);
      for (const phrase of superseded) {
        expect(messages, `${locale}: ${phrase}`).not.toContain(phrase);
      }
      for (const key of descriptionKeys) {
        expect(translated[key].description, `${locale}.${key}`).toBe(
          english[key].description,
        );
      }
    }
  });

  it("does not wholesale-copy English into non-English catalogs", () => {
    const exceptions = new Set(["en", "en_AU", "en_GB", "en_US"]);
    for (const locale of LOCALES.filter((code) => !exceptions.has(code))) {
      const translated = catalog(locale);
      const copied = englishKeys.filter(
        (key) =>
          key !== "extName" &&
          translated[key].message.toLowerCase() ===
            english[key].message.toLowerCase(),
      );
      expect(copied.length / (englishKeys.length - 1), locale).toBeLessThan(
        0.25,
      );
    }
  });
});

describe("message lookup and document locale", () => {
  it("uses the English fallback and Chrome-style substitutions without APIs", () => {
    vi.stubGlobal("browser", undefined);
    vi.stubGlobal("chrome", undefined);
    expect(msg("setupTitle")).toBe("When were you born?");
    expect(msg("progressCaption", ["25%", "80"])).toBe("25% of 80 yrs lived");
  });

  it("prefers Firefox i18n and normalizes locale underscores", () => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", {
      i18n: {
        getUILanguage: () => "pt_BR",
        getMessage: (key) => (key === "settings" ? "Configurações" : ""),
      },
    });
    expect(getLocale()).toBe("pt-BR");
    expect(msg("settings")).toBe("Configurações");
  });

  it("applies localized language, direction, and title", () => {
    mockLocale("ar", { pageTitle: "Mortality — علامة تبويب جديدة" });
    applyDocumentLocale();
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.title).toBe("Mortality — علامة تبويب جديدة");
  });

  it("passes substitutions through to the extension API", () => {
    mockLocale("de", {
      progressCaption: ([percent, years]) =>
        `${percent} von ${years} Jahren gelebt`,
    });
    expect(msg("progressCaption", ["25 %", "80"])).toBe(
      "25 % von 80 Jahren gelebt",
    );
  });

  it.each(["ar", "fa", "he"])("falls back to RTL for %s", (locale) => {
    mockLocale(locale);
    expect(getDirection()).toBe("rtl");
  });

  it("honors the extension-provided bidi direction", () => {
    mockLocale("en");
    chrome.i18n.getMessage = (key) => (key === "@@bidi_dir" ? "rtl" : "");
    expect(getDirection()).toBe("rtl");
  });

  it("normalizes supported language choices and rejects unknown values", () => {
    expect(normalizeLanguage("pt-BR")).toBe("pt_BR");
    expect(normalizeLanguage("zh_CN")).toBe("zh_CN");
    expect(normalizeLanguage("not-a-locale")).toBe(AUTOMATIC_LANGUAGE);
    expect(normalizeLanguage(null)).toBe(AUTOMATIC_LANGUAGE);
  });

  it("provides a readable native name for every language choice", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(languageName(language).trim(), language).not.toBe("");
    }
    expect(languageName("de")).toMatch(/Deutsch/i);
  });

  it("localizes ISO2 region names and falls back to official UN English", () => {
    mockLocale("de");
    expect(regionName("JP", "Japan")).toBe("Japan");
    expect(regionName("US", "United States of America")).toMatch(
      /Vereinigte Staaten/,
    );
    mockLocale("ar");
    expect(regionName("JP", "Japan")).toMatch(/اليابان/);
    expect(regionName(null, "Channel Islands")).toBe("Channel Islands");
    expect(regionName("bad", "Official fallback")).toBe("Official fallback");
  });

  it("reuses one region display-name formatter per locale", () => {
    mockLocale("ca");
    const displayNames = vi.spyOn(Intl, "DisplayNames");
    regionName("JP", "Japan");
    regionName("US", "United States of America");
    expect(displayNames).toHaveBeenCalledTimes(1);
    displayNames.mockRestore();
  });

  it("uses locale-aware collation", () => {
    mockLocale("sv");
    expect(["Öland", "Albanien", "Åland"].sort(compareLocaleText)).toEqual([
      "Albanien",
      "Åland",
      "Öland",
    ]);
  });

  it("reuses one collator for repeated comparisons in the same locale", () => {
    mockLocale("ca");
    const collator = vi.spyOn(Intl, "Collator");
    compareLocaleText("Barcelona", "Àlaba");
    compareLocaleText("Girona", "Barcelona");
    expect(collator).toHaveBeenCalledTimes(1);
    collator.mockRestore();
  });

  it("builds pinned, localized, searchable country and area options", () => {
    mockLocale("ar");
    const options = buildLifeTableOptions();
    expect(options).toHaveLength(239);
    expect(options.slice(0, 2).map(({ value }) => value)).toEqual([
      "world",
      "us",
    ]);
    expect(options.find(({ value }) => value === "un:392").label).toMatch(
      /اليابان/,
    );
    expect(filterSearchOptions(options, "اليابان")).toHaveLength(1);
    expect(filterSearchOptions(options, "Japan")).toHaveLength(1);
    expect(filterSearchOptions(options, "JPN 392")).toHaveLength(1);
    expect(filterSearchOptions(options, "UN 2023 Japan")).toHaveLength(1);
  });

  it("loads a manually selected catalog instead of the browser locale", async () => {
    mockLocale("en", { settings: "Browser settings" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          settings: { message: "Einstellungen" },
          progressCaption: {
            message: "$PERCENT$ von $YEARS$ Jahren gelebt",
            placeholders: {
              percent: { content: "$1" },
              years: { content: "$2" },
            },
          },
        }),
      })),
    );

    await expect(activateLanguage("de")).resolves.toBe("de");
    expect(getLocale()).toBe("de");
    expect(msg("settings")).toBe("Einstellungen");
    expect(msg("progressCaption", ["25 %", "80"])).toBe(
      "25 % von 80 Jahren gelebt",
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining("/de/") }),
    );
  });

  it("uses the selected language direction instead of the browser direction", async () => {
    mockLocale("en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          pageTitle: { message: "Mortality — علامة تبويب جديدة" },
        }),
      })),
    );

    await activateLanguage("ar");
    applyDocumentLocale();
    expect(getDirection()).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("uses a manual language override for country display names", async () => {
    mockLocale("en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })),
    );
    await activateLanguage("de");
    expect(regionName("US", "United States of America")).toMatch(
      /Vereinigte Staaten/,
    );
  });
});

describe("locale-aware formatting", () => {
  it("keeps exactly nine localized decimal places", () => {
    mockLocale("de");
    expect(formatFixedParts(20.5, 9)).toEqual({
      integer: "20",
      decimal: ",",
      fraction: "500000000",
      text: "20,500000000",
    });
    mockLocale("fr");
    expect(formatFixedParts(20.5, 9).decimal).toBe(",");
  });

  it("uses Arabic-Indic digits and localized percentages", () => {
    mockLocale("ar");
    expect(formatNumber(1234)).toMatch(/[١٢٣٤]/);
    expect(formatPercent(0.25)).toMatch(/[٢٥]/);
  });

  it("formats the UTC-pinned wall-clock date in the UI locale", () => {
    mockLocale("de", {
      born: ([date]) => `Geboren am ${date}`,
    });
    expect(
      formatDate(Date.UTC(1990, 4, 15), {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    ).toContain("Mai");
    expect(formatBorn("1990-05-15T23:30")).toContain("15. Mai 1990");
  });

  it("uses plural-sensitive Russian and Polish unit grammar", () => {
    mockLocale("ru");
    expect(formatUnit(1, "year")).toContain("год");
    expect(formatUnit(2, "year")).toContain("года");
    expect(formatUnit(5, "year")).toContain("лет");
    mockLocale("pl");
    expect(formatUnit(1, "year")).toContain("rok");
    expect(formatUnit(2, "year")).toContain("lata");
    expect(formatUnit(5, "year")).toContain("lat");
  });

  it.each(["ja", "zh_CN"])(
    "uses compact native year units for %s",
    (locale) => {
      mockLocale(locale);
      expect(
        formatUnitParts(20, "year")
          .map((part) => part.value)
          .join(""),
      ).toContain("年");
    },
  );

  it("joins accessible quantities with locale list grammar", () => {
    mockLocale("en");
    expect(formatList(["1 day", "2 hours", "3 minutes"])).toBe(
      "1 day, 2 hours, and 3 minutes",
    );
  });
});

describe("localized rendering", () => {
  it("renders a non-English setup without prior English UI strings", () => {
    mockLocale("de", {
      setupTitle: "Wann wurden Sie geboren?",
      setupSubtitle: "Ihr Alter zählt in jedem neuen Tab live hoch.",
      birthDateAria: "Geburtsdatum",
      birthTimeAria: "Geburtszeit (optional)",
      start: "Starten",
      timeHint: "Die Zeitangabe ist optional.",
      birthplaceLabel: "Wo wurden Sie geboren?",
      birthplaceHint: "Standardmäßig wird Ihre aktuelle Zeitzone verwendet.",
      actuarialBaseline: "Datenquelle zur Lebenserwartung",
      baselineSetupHint: "Standardmäßig weltweite Daten.",
      lifeTableWorld: "Welt — UN 2023",
      lifeTableUS: "Vereinigte Staaten — SSA 2023",
      sexAtBirth: "Bei der Geburt zugewiesenes Geschlecht",
      sexHint: "Optional für eine genauere Schätzung.",
      sexUnspecified: "Keine Angabe",
      sexFemale: "Weiblich",
      sexMale: "Männlich",
    });
    const app = document.createElement("div");
    renderSetup(app, { start: vi.fn() }, null);
    expect(app.querySelector(".screen-title").textContent).toBe(
      "Wann wurden Sie geboren?",
    );
    expect(app.textContent).not.toContain("When were you born?");
    expect(app.textContent).not.toContain("Where were you born?");
    expect(app.textContent).not.toContain("Life expectancy data source");
  });
});
