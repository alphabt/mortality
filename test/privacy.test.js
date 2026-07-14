import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");
const pngDimensions = (...parts) => {
  const png = readFileSync(join(ROOT, ...parts));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
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

  it("publishes complete social preview metadata", () => {
    const demo = read("src", "tab.html");
    const workflow = read(".github", "workflows", "pages.yml");
    const document = new JSDOM(demo).window.document;
    const meta = (selector) =>
      document.querySelector(selector)?.getAttribute("content");
    const description =
      "Your age, counting up live on every new tab. A quiet, private reminder that time is passing.";
    const image = "https://alphabt.github.io/mortality/social-preview.png";
    const imageAlt =
      "Mortality's live age counter reading 36.234271 on a quiet blue canvas.";

    expect(meta('meta[name="description"]')).toBe(description);
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://alphabt.github.io/mortality/");
    expect(meta('meta[property="og:type"]')).toBe("website");
    expect(meta('meta[property="og:site_name"]')).toBe("Mortality");
    expect(meta('meta[property="og:title"]')).toBe(
      "Mortality — Your age, counting up live",
    );
    expect(meta('meta[property="og:description"]')).toBe(description);
    expect(meta('meta[property="og:url"]')).toBe(
      "https://alphabt.github.io/mortality/",
    );
    expect(meta('meta[property="og:image"]')).toBe(image);
    expect(meta('meta[property="og:image:type"]')).toBe("image/png");
    expect(meta('meta[property="og:image:width"]')).toBe("1200");
    expect(meta('meta[property="og:image:height"]')).toBe("630");
    expect(meta('meta[property="og:image:alt"]')).toBe(imageAlt);
    expect(meta('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(meta('meta[name="twitter:title"]')).toBe(
      "Mortality — Your age, counting up live",
    );
    expect(meta('meta[name="twitter:description"]')).toBe(description);
    expect(meta('meta[name="twitter:image"]')).toBe(image);
    expect(meta('meta[name="twitter:image:alt"]')).toBe(imageAlt);
    expect(
      pngDimensions("store-assets", "final", "social-preview-1200x630.png"),
    ).toEqual([1200, 630]);
    expect(workflow).toContain(
      "cp store-assets/final/social-preview-1200x630.png public/social-preview.png",
    );
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
        alt: "Install Mortality from the Chrome Web Store",
        listing:
          "https://chromewebstore.google.com/detail/mortality/dmcopoldcoemapdejndbdnfmbofbkmbh",
      },
      {
        file: "edge_addons_badge.png",
        dimensions: [1178, 312],
        alt: "Install Mortality from Microsoft Edge Add-ons",
        listing:
          "https://microsoftedge.microsoft.com/addons/detail/dljbhjjkfdabmfijhmcoodklndhminom",
      },
      {
        file: "firefox_addons_badge.png",
        dimensions: [172, 60],
        alt: "Install Mortality from Firefox Browser Add-ons",
        listing: "https://addons.mozilla.org/firefox/addon/mortality/",
      },
    ];

    let previousPosition = -1;
    for (const { file, dimensions, alt, listing } of badges) {
      expect(pngDimensions("images", file)).toEqual(dimensions);
      expect(install).toContain(`href="${listing}"`);
      expect(install).toContain(
        `src="./images/${file}" alt="${alt}" height="58"`,
      );
      const position = install.indexOf(`src="./images/${file}"`);
      expect(position).toBeGreaterThan(previousPosition);
      previousPosition = position;
    }
    expect(install).not.toContain("width=");
    expect(install).not.toMatch(/(?:chrome|firefox|edge)_logo\.svg/);
    expect(readme).not.toContain("chrome.google.com/webstore");
  });
});
