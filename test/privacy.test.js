import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");
const pngDimensions = (...parts) => {
  const png = readFileSync(join(ROOT, ...parts));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

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

  it("uses official store badges and canonical listing links", () => {
    const readme = read("README.md");
    const install = readme.slice(
      readme.indexOf("## Install"),
      readme.indexOf("## Development"),
    );
    const badges = [
      {
        file: "chrome_web_store_badge.png",
        dimensions: [206, 58],
        alt: "Available in the Chrome Web Store",
        listing:
          "https://chromewebstore.google.com/detail/mortality/dmcopoldcoemapdejndbdnfmbofbkmbh",
      },
      {
        file: "firefox_addons_badge.png",
        dimensions: [172, 60],
        alt: "Get the Mortality add-on for Firefox",
        listing: "https://addons.mozilla.org/firefox/addon/mortality/",
      },
      {
        file: "edge_addons_badge.png",
        dimensions: [1178, 312],
        alt: "Get Mortality from Microsoft Edge",
        listing:
          "https://microsoftedge.microsoft.com/addons/detail/dljbhjjkfdabmfijhmcoodklndhminom",
      },
    ];

    for (const { file, dimensions, alt, listing } of badges) {
      expect(pngDimensions("images", file)).toEqual(dimensions);
      expect(install).toContain(`href="${listing}"`);
      expect(install).toContain(
        `src="./images/${file}" alt="${alt}" height="58"`,
      );
    }
    expect(install).not.toContain("width=");
    expect(install).not.toMatch(/(?:chrome|firefox|edge)_logo\.svg/);
    expect(readme).not.toContain("chrome.google.com/webstore");
  });
});
