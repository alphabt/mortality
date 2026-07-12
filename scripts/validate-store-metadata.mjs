import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const METADATA_PATH = join(ROOT, "store-listing", "metadata.json");

export const PRIORITY_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "ja",
  "pt_BR",
  "zh_CN",
  "zh_TW",
  "ko",
];

const STORE_LOCALES = {
  en: { chrome: "en", edge: "en-US", firefox: "en-US" },
  de: { chrome: "de", edge: "de-DE", firefox: "de" },
  es: { chrome: "es", edge: "es-ES", firefox: "es" },
  fr: { chrome: "fr", edge: "fr-FR", firefox: "fr" },
  ja: { chrome: "ja", edge: "ja-JP", firefox: "ja" },
  pt_BR: { chrome: "pt_BR", edge: "pt-BR", firefox: "pt-BR" },
  zh_CN: { chrome: "zh_CN", edge: "zh-CN", firefox: "zh-CN" },
  zh_TW: { chrome: "zh_TW", edge: "zh-TW", firefox: "zh-TW" },
  ko: { chrome: "ko", edge: "ko-KR", firefox: "ko" },
};
const FIREFOX_ALLOWED_TAGS = new Set([
  "ad blocker",
  "anti malware",
  "anti tracker",
  "antivirus",
  "chat",
  "container",
  "content blocker",
  "coupon",
  "dailymotion",
  "dark mode",
  "dndbeyond",
  "download",
  "facebook",
  "google",
  "image search",
  "mp3",
  "music",
  "password manager",
  "pinterest",
  "pixiv",
  "privacy",
  "reddit",
  "roblox",
  "scholar",
  "search",
  "security",
  "shopping",
  "social media",
  "streaming",
  "torrent",
  "translate",
  "twitch",
  "twitter",
  "user scripts",
  "video converter",
  "video downloader",
  "vpn",
  "wayback machine",
  "whatsapp",
  "word counter",
  "youtube",
  "zoom",
]);
const SUMMARY_MAX_LENGTH = 132;
const DESCRIPTION_MIN_LENGTH = 250;
const DESCRIPTION_MAX_LENGTH = 10_000;
const EDGE_MAX_SEARCH_TERMS = 7;
const EDGE_MAX_SEARCH_WORDS = 21;
const EDGE_MAX_TERM_LENGTH = 30;
const FIREFOX_TAG_MAX_LENGTH = 30;
const EXPECTED_URLS = {
  website: "https://alphabt.github.io/mortality/",
  support: "https://github.com/alphabt/mortality/issues",
  privacy: "https://alphabt.github.io/mortality/privacy.html",
};
const FORBIDDEN_COPY = /death[\s-]+clock/iu;

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function codePointLength(value) {
  return [...value].length;
}

function readJson(path, errors, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label} is not readable JSON: ${error.message}`);
    return null;
  }
}

function expectKeys(value, expected, label, errors) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return false;
  }

  let valid = true;
  const expectedSet = new Set(expected);
  for (const key of expected) {
    if (!(key in value)) {
      errors.push(`${label} is missing "${key}"`);
      valid = false;
    }
  }
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) {
      errors.push(`${label} has unknown field "${key}"`);
      valid = false;
    }
  }
  return valid;
}

function collectStrings(value, path = "metadata", strings = []) {
  if (typeof value === "string") {
    strings.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectStrings(item, `${path}[${index}]`, strings),
    );
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${path}.${key}`, strings);
    }
  }
  return strings;
}

export function renderFullDescription(localeMetadata) {
  return localeMetadata.fullDescription.join("\n\n");
}

export function loadStoreMetadata(root = ROOT) {
  return JSON.parse(
    readFileSync(join(root, "store-listing", "metadata.json"), "utf8"),
  );
}

export function validateStoreMetadata(metadata, { root = ROOT } = {}) {
  const errors = [];
  const summaries = {};
  let catalogCount = 0;

  if (
    !expectKeys(
      metadata,
      [
        "schemaVersion",
        "productName",
        "summary",
        "urls",
        "chrome",
        "firefox",
        "locales",
      ],
      "metadata",
      errors,
    )
  ) {
    return { errors, summaries, catalogCount };
  }

  if (metadata.schemaVersion !== 1) {
    errors.push("metadata.schemaVersion must be 1");
  }
  if (metadata.productName !== "Mortality") {
    errors.push('metadata.productName must be "Mortality"');
  }

  const summaryIsValid = expectKeys(
    metadata.summary,
    ["catalogDirectory", "nameMessageKey", "descriptionMessageKey"],
    "metadata.summary",
    errors,
  );
  if (summaryIsValid) {
    if (metadata.summary.catalogDirectory !== "src/_locales") {
      errors.push('metadata.summary.catalogDirectory must be "src/_locales"');
    }
    if (metadata.summary.nameMessageKey !== "extName") {
      errors.push('metadata.summary.nameMessageKey must be "extName"');
    }
    if (metadata.summary.descriptionMessageKey !== "extDescription") {
      errors.push(
        'metadata.summary.descriptionMessageKey must be "extDescription"',
      );
    }
  }

  if (
    expectKeys(
      metadata.urls,
      ["website", "support", "privacy"],
      "metadata.urls",
      errors,
    )
  ) {
    for (const [name, expected] of Object.entries(EXPECTED_URLS)) {
      const value = metadata.urls[name];
      if (value !== expected) {
        errors.push(`metadata.urls.${name} must be ${expected}`);
      }
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") {
          errors.push(`metadata.urls.${name} must use HTTPS`);
        }
        if (url.search || url.hash) {
          errors.push(`metadata.urls.${name} must not contain a query or hash`);
        }
      } catch {
        errors.push(`metadata.urls.${name} must be a valid URL`);
      }
    }
  }

  if (expectKeys(metadata.chrome, ["category"], "metadata.chrome", errors)) {
    if (metadata.chrome.category !== "Well-being") {
      errors.push('metadata.chrome.category must be "Well-being"');
    }
  }

  if (expectKeys(metadata.firefox, ["tags"], "metadata.firefox", errors)) {
    if (
      !Array.isArray(metadata.firefox.tags) ||
      metadata.firefox.tags.length === 0
    ) {
      errors.push("metadata.firefox.tags must be a non-empty array");
    } else {
      const seen = new Set();
      for (const [index, tag] of metadata.firefox.tags.entries()) {
        const label = `metadata.firefox.tags[${index}]`;
        if (typeof tag !== "string" || tag.trim() !== tag || tag === "") {
          errors.push(`${label} must be a trimmed, non-empty string`);
          continue;
        }
        if (codePointLength(tag) > FIREFOX_TAG_MAX_LENGTH) {
          errors.push(`${label} exceeds the 30-character repository guard`);
        }
        const normalized = tag.toLocaleLowerCase("en");
        if (seen.has(normalized)) errors.push(`${label} is duplicated`);
        if (!FIREFOX_ALLOWED_TAGS.has(normalized)) {
          errors.push(`${label} is not in Firefox's allowed tag vocabulary`);
        }
        seen.add(normalized);
      }
    }
  }

  if (!isRecord(metadata.locales)) {
    errors.push("metadata.locales must be an object");
  } else {
    for (const locale of PRIORITY_LOCALES) {
      if (!(locale in metadata.locales)) {
        errors.push(`metadata.locales is missing priority locale "${locale}"`);
      }
    }

    for (const [locale, localeMetadata] of Object.entries(metadata.locales)) {
      const label = `metadata.locales.${locale}`;
      if (
        !expectKeys(
          localeMetadata,
          ["storeLocales", "fullDescription", "edgeSearchTerms"],
          label,
          errors,
        )
      ) {
        continue;
      }

      if (
        expectKeys(
          localeMetadata.storeLocales,
          ["chrome", "edge", "firefox"],
          `${label}.storeLocales`,
          errors,
        )
      ) {
        for (const [store, storeLocale] of Object.entries(
          localeMetadata.storeLocales,
        )) {
          if (
            typeof storeLocale !== "string" ||
            storeLocale.trim() !== storeLocale ||
            storeLocale === ""
          ) {
            errors.push(
              `${label}.storeLocales.${store} must be a trimmed, non-empty string`,
            );
          }
        }
        const expectedStoreLocales = STORE_LOCALES[locale];
        if (!expectedStoreLocales) {
          errors.push(`${label} has no supported store-locale mapping`);
        } else {
          for (const [store, expectedLocale] of Object.entries(
            expectedStoreLocales,
          )) {
            if (localeMetadata.storeLocales[store] !== expectedLocale) {
              errors.push(
                `${label}.storeLocales.${store} must be "${expectedLocale}"`,
              );
            }
          }
        }
      }

      if (
        !Array.isArray(localeMetadata.fullDescription) ||
        localeMetadata.fullDescription.length === 0 ||
        localeMetadata.fullDescription.some(
          (paragraph) =>
            typeof paragraph !== "string" ||
            paragraph === "" ||
            paragraph.trim() !== paragraph,
        )
      ) {
        errors.push(
          `${label}.fullDescription must be an array of trimmed, non-empty paragraphs`,
        );
      } else {
        const description = renderFullDescription(localeMetadata);
        const length = codePointLength(description);
        if (length < DESCRIPTION_MIN_LENGTH) {
          errors.push(
            `${label}.fullDescription is shorter than Edge's 250-character minimum`,
          );
        }
        if (length > DESCRIPTION_MAX_LENGTH) {
          errors.push(
            `${label}.fullDescription exceeds Edge's 10,000-character maximum`,
          );
        }
        if (!description.includes(metadata.productName)) {
          errors.push(
            `${label}.fullDescription must keep "Mortality" untranslated`,
          );
        }
      }

      if (!Array.isArray(localeMetadata.edgeSearchTerms)) {
        errors.push(`${label}.edgeSearchTerms must be an array`);
      } else {
        if (localeMetadata.edgeSearchTerms.length === 0) {
          errors.push(`${label}.edgeSearchTerms must not be empty`);
        }
        if (localeMetadata.edgeSearchTerms.length > EDGE_MAX_SEARCH_TERMS) {
          errors.push(`${label}.edgeSearchTerms exceeds Edge's 7-term maximum`);
        }

        let words = 0;
        const seen = new Set();
        for (const [index, term] of localeMetadata.edgeSearchTerms.entries()) {
          const termLabel = `${label}.edgeSearchTerms[${index}]`;
          if (typeof term !== "string" || term.trim() !== term || term === "") {
            errors.push(`${termLabel} must be a trimmed, non-empty string`);
            continue;
          }
          if (codePointLength(term) > EDGE_MAX_TERM_LENGTH) {
            errors.push(`${termLabel} exceeds Edge's 30-character maximum`);
          }
          words += term.split(/\s+/u).length;
          const normalized = term.normalize("NFKC").toLowerCase();
          if (seen.has(normalized)) errors.push(`${termLabel} is duplicated`);
          seen.add(normalized);
        }
        if (words > EDGE_MAX_SEARCH_WORDS) {
          errors.push(
            `${label}.edgeSearchTerms exceeds Edge's 21-word maximum`,
          );
        }
      }
    }
  }

  if (summaryIsValid) {
    const manifest = readJson(
      join(root, "src", "manifest.json"),
      errors,
      "src/manifest.json",
    );
    if (manifest) {
      const expectedName = `__MSG_${metadata.summary.nameMessageKey}__`;
      const expectedDescription = `__MSG_${metadata.summary.descriptionMessageKey}__`;
      if (manifest.name !== expectedName) {
        errors.push(`src/manifest.json name must reference ${expectedName}`);
      }
      if (manifest.description !== expectedDescription) {
        errors.push(
          `src/manifest.json description must reference ${expectedDescription}`,
        );
      }
      if (manifest.default_locale !== "en") {
        errors.push('src/manifest.json default_locale must be "en"');
      }
    }

    const catalogDirectory = join(root, metadata.summary.catalogDirectory);
    let catalogLocales = [];
    try {
      catalogLocales = readdirSync(catalogDirectory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      errors.push(
        `${metadata.summary.catalogDirectory} is not readable: ${error.message}`,
      );
    }
    catalogCount = catalogLocales.length;

    for (const locale of catalogLocales) {
      const catalog = readJson(
        join(catalogDirectory, locale, "messages.json"),
        errors,
        `${metadata.summary.catalogDirectory}/${locale}/messages.json`,
      );
      if (!catalog) continue;

      const name = catalog[metadata.summary.nameMessageKey]?.message;
      const summary = catalog[metadata.summary.descriptionMessageKey]?.message;
      if (name !== metadata.productName) {
        errors.push(
          `${locale}.${metadata.summary.nameMessageKey} must keep "Mortality" untranslated`,
        );
      }
      if (typeof summary !== "string" || summary.trim() === "") {
        errors.push(
          `${locale}.${metadata.summary.descriptionMessageKey} must be a non-empty string`,
        );
      } else {
        summaries[locale] = summary;
        if (codePointLength(summary) > SUMMARY_MAX_LENGTH) {
          errors.push(
            `${locale}.${metadata.summary.descriptionMessageKey} exceeds Chrome's 132-character summary limit`,
          );
        }
      }
    }

    if (isRecord(metadata.locales)) {
      for (const locale of Object.keys(metadata.locales)) {
        if (!catalogLocales.includes(locale)) {
          errors.push(
            `metadata.locales.${locale} has no matching package catalog`,
          );
        }
      }
    }
  }

  for (const [path, value] of [
    ...collectStrings(metadata),
    ...Object.entries(summaries).map(([locale, summary]) => [
      `package summary ${locale}`,
      summary,
    ]),
  ]) {
    if (FORBIDDEN_COPY.test(value)) {
      errors.push(`${path} contains the forbidden phrase "death clock"`);
    }
  }

  return { errors, summaries, catalogCount };
}

function printLocale(metadata, summaries, locale) {
  const localeMetadata = metadata.locales[locale];
  if (!localeMetadata) {
    const available = Object.keys(metadata.locales).join(", ");
    throw new Error(`Unknown locale "${locale}". Choose one of: ${available}`);
  }

  console.log(`LOCALE\n${locale}`);
  console.log(`\nSTORE LOCALES`);
  for (const [store, storeLocale] of Object.entries(
    localeMetadata.storeLocales,
  )) {
    console.log(`${store}: ${storeLocale}`);
  }
  console.log(`\nNAME\n${metadata.productName}`);
  console.log(`\nPACKAGE SUMMARY\n${summaries[locale]}`);
  console.log(`\nFULL DESCRIPTION\n${renderFullDescription(localeMetadata)}`);
  console.log(
    `\nEDGE SEARCH TERMS\n${localeMetadata.edgeSearchTerms
      .map((term) => `- ${term}`)
      .join("\n")}`,
  );
  console.log(
    `\nSHARED URLS\nwebsite: ${metadata.urls.website}\nsupport: ${metadata.urls.support}\nprivacy: ${metadata.urls.privacy}`,
  );
  console.log(
    `\nFIREFOX TAGS (GLOBAL)\n${metadata.firefox.tags
      .map((tag) => `- ${tag}`)
      .join("\n")}`,
  );
}

function runCli() {
  const metadata = readJson(METADATA_PATH, [], "store-listing/metadata.json");
  if (!metadata) {
    console.error("Unable to read store-listing/metadata.json");
    process.exitCode = 1;
    return;
  }

  const result = validateStoreMetadata(metadata);
  if (result.errors.length > 0) {
    console.error(
      `Store metadata validation failed:\n${result.errors
        .map((error) => `- ${error}`)
        .join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(
      `Store metadata valid: ${Object.keys(metadata.locales).length} full descriptions, ${result.catalogCount} package summaries.`,
    );
    return;
  }
  if (args.length === 2 && args[0] === "--locale") {
    try {
      printLocale(metadata, result.summaries, args[1]);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
    return;
  }

  console.error(
    "Usage: node scripts/validate-store-metadata.mjs [--locale <locale>]",
  );
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCli();
}
