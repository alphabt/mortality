import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

describe("privacy and trust surfaces", () => {
  it("deploys a stable site-only policy page", () => {
    const policyPath = join(ROOT, "site", "privacy.html");
    const workflow = read(".github", "workflows", "pages.yml");
    const pack = read("scripts", "pack.sh");
    const zipInvocation = pack
      .split("\n")
      .find((line) => line.includes("zip -rqX"));

    expect(existsSync(policyPath)).toBe(true);
    expect(existsSync(join(ROOT, "src", "privacy.html"))).toBe(false);
    expect(workflow).toContain("cp site/privacy.html public/privacy.html");
    expect(zipInvocation).toContain("(cd src && zip");
    expect(zipInvocation).not.toContain("site/");
  });

  it("documents the implemented storage, sync, and data controls", () => {
    const policy = read("site", "privacy.html");
    const normalized = policy.replace(/\s+/g, " ").toLowerCase();

    expect(normalized).toContain(
      '<link rel="canonical" href="https://alphabt.github.io/mortality/privacy.html"',
    );
    expect(policy).toContain('<main id="main" tabindex="-1">');
    expect(policy).toContain("<h1>Privacy</h1>");
    expect(policy).toContain(":focus-visible");
    expect(policy).not.toContain("<script");

    for (const disclosure of [
      "local by default",
      "theme and custom colors",
      "counter mode",
      "numeral style",
      "reflection setting",
      "language",
      "birth date and time",
      "birth time zone",
      "sex-at-birth value",
      "life-expectancy data source or custom number of years",
      "browser vendor’s account and sync-storage service",
      "no mortality account or backend",
      "remove both preference and personal payloads",
      "mortality-settings.json",
      "the file is not uploaded to mortality",
      "contact and support",
    ]) {
      expect(normalized).toContain(disclosure);
    }
  });

  it("uses Google's official badge and canonical Chrome listing", () => {
    const readme = read("README.md");

    expect(readme).toContain(
      "https://chromewebstore.google.com/detail/mortality/dmcopoldcoemapdejndbdnfmbofbkmbh",
    );
    expect(readme).toContain(
      "https://developer.chrome.com/static/docs/webstore/branding/image/206x58-chrome-web-043497a3d766e.png",
    );
    expect(readme).toContain('width="206" height="58"');
    expect(readme).not.toContain("chrome_logo.svg");
    expect(readme).not.toContain("chrome.google.com/webstore");
  });
});
