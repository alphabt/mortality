import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PRIORITY_LOCALES,
  loadStoreMetadata,
  renderFullDescription,
  validateStoreMetadata,
} from "../scripts/validate-store-metadata.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "validate-store-metadata.mjs");
const metadata = loadStoreMetadata(ROOT);

function cloneMetadata() {
  return structuredClone(metadata);
}

describe("canonical store listing metadata", () => {
  it("passes schema, locale, limit, URL, and package-summary validation", () => {
    const result = validateStoreMetadata(metadata, { root: ROOT });

    expect(result.errors).toEqual([]);
    expect(result.catalogCount).toBe(55);
    expect(Object.keys(metadata.locales).sort()).toEqual(
      [...PRIORITY_LOCALES].sort(),
    );

    for (const locale of PRIORITY_LOCALES) {
      const catalog = JSON.parse(
        readFileSync(
          join(ROOT, "src", "_locales", locale, "messages.json"),
          "utf8",
        ),
      );
      expect(result.summaries[locale]).toBe(
        catalog[metadata.summary.descriptionMessageKey].message,
      );
      expect(renderFullDescription(metadata.locales[locale])).toContain(
        "Mortality",
      );
    }
  });

  it("rejects missing priority locales, forbidden copy, and URL drift", () => {
    const invalid = cloneMetadata();
    delete invalid.locales.ko;
    invalid.locales.en.fullDescription[0] += " Death-clock positioning.";
    invalid.urls.support = "http://example.com/support";

    const errors = validateStoreMetadata(invalid, { root: ROOT }).errors.join(
      "\n",
    );
    expect(errors).toContain('missing priority locale "ko"');
    expect(errors).toContain('forbidden phrase "death clock"');
    expect(errors).toContain(
      "metadata.urls.support must be https://github.com/alphabt/mortality/issues",
    );
    expect(errors).toContain("metadata.urls.support must use HTTPS");
  });

  it("enforces description and Edge search-term limits", () => {
    const invalid = cloneMetadata();
    invalid.locales.en.fullDescription = ["Too short for a store listing."];
    invalid.locales.de.edgeSearchTerms = [
      "eins",
      "zwei",
      "drei",
      "vier",
      "fünf",
      "sechs",
      "sieben",
      "acht",
    ];
    invalid.locales.es.edgeSearchTerms = [
      "uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós",
    ];

    const errors = validateStoreMetadata(invalid, { root: ROOT }).errors.join(
      "\n",
    );
    expect(errors).toContain("250-character minimum");
    expect(errors).toContain("7-term maximum");
    expect(errors).toContain("30-character maximum");
    expect(errors).toContain("21-word maximum");
  });

  it("reports malformed schema without throwing", () => {
    const invalid = cloneMetadata();
    delete invalid.summary.catalogDirectory;
    invalid.locales.en.unexpected = true;

    expect(() => validateStoreMetadata(invalid, { root: ROOT })).not.toThrow();
    const errors = validateStoreMetadata(invalid, { root: ROOT }).errors.join(
      "\n",
    );
    expect(errors).toContain('metadata.summary is missing "catalogDirectory"');
    expect(errors).toContain(
      'metadata.locales.en has unknown field "unexpected"',
    );
  });

  it("rejects unsupported Firefox tags and invalid store locale mappings", () => {
    const invalid = cloneMetadata();
    invalid.firefox.tags = ["not-a-real-tag"];
    invalid.locales.pt_BR.storeLocales.edge = "pt-BRR";
    invalid.locales.zh_CN.storeLocales.firefox = "zh-CNN";

    const errors = validateStoreMetadata(invalid, { root: ROOT }).errors.join(
      "\n",
    );
    expect(errors).toContain("not in Firefox's allowed tag vocabulary");
    expect(errors).toContain(
      'metadata.locales.pt_BR.storeLocales.edge must be "pt-BR"',
    );
    expect(errors).toContain(
      'metadata.locales.zh_CN.storeLocales.firefox must be "zh-CN"',
    );
  });

  it("prints dashboard-ready localized copy without duplicating summaries", () => {
    const result = spawnSync(process.execPath, [SCRIPT, "--locale", "de"], {
      cwd: ROOT,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("PACKAGE SUMMARY");
    expect(result.stdout).toContain(
      "Mach jeden neuen Tab zu einem Live-Zähler deines Alters",
    );
    expect(result.stdout).toContain("FULL DESCRIPTION");
    expect(result.stdout).toContain("EDGE SEARCH TERMS");
    expect(result.stdout).toContain(
      "https://alphabt.github.io/mortality/privacy.html",
    );
  });
});
