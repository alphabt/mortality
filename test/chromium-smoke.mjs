import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSION_PATH = path.join(ROOT, "src");
const BIRTH_DATE = "1990-06-15";
const SAVED_BIRTH = `${BIRTH_DATE}T00:00`;
const PAPER_BACKGROUND = "#fafaf8";

function assertExtensionPage(page) {
  const url = new URL(page.url());
  assert.equal(url.protocol, "chrome-extension:");
  assert.equal(url.pathname, "/tab.html");
}

async function openNewTab(context, existingPage) {
  const page = existingPage ?? (await context.newPage());
  await page.goto("chrome://newtab/");
  await page.waitForURL(
    (url) =>
      url.protocol === "chrome-extension:" && url.pathname === "/tab.html",
  );
  assertExtensionPage(page);
  await page.locator("#app > *").first().waitFor({ state: "visible" });
  return page;
}

async function assertLiveCounter(page) {
  await page.locator("body.screen-counter").waitFor({ state: "visible" });
  const count = page.locator("#count");
  await count.waitFor({ state: "visible" });
  await page.waitForFunction(() =>
    /\d/.test(document.querySelector("#count")?.textContent ?? ""),
  );
  assert.match((await count.innerText()).trim(), /\d/);
}

async function assertUniformLifeGrid(page) {
  await page.locator("#weeks-btn").click();
  await page.locator("body.screen-weeks").waitFor({ state: "visible" });
  const malformedRow = await page
    .locator(".weeks-band")
    .evaluateAll((bands) => {
      for (const band of bands) {
        const heights = [...band.children].map(
          (cell) => cell.getBoundingClientRect().height,
        );
        if (Math.max(...heights) - Math.min(...heights) > 0.001) {
          return {
            age: band.parentElement.dataset.age,
            minHeight: Math.min(...heights),
            maxHeight: Math.max(...heights),
          };
        }
      }
      return null;
    });
  assert.equal(
    malformedRow,
    null,
    malformedRow
      ? `Life-grid age ${malformedRow.age} has cell heights from ${malformedRow.minHeight}px to ${malformedRow.maxHeight}px`
      : undefined,
  );
  await page.locator("#weeks-back").click();
  await assertLiveCounter(page);
}

async function runSmoke(context) {
  const initialPage = context.pages()[0] ?? (await context.newPage());
  const page = await openNewTab(context, initialPage);

  await page.locator("body.screen-setup").waitFor({ state: "visible" });
  const birthDate = page.locator("#birth-date");
  await birthDate.waitFor({ state: "visible" });
  await birthDate.fill(BIRTH_DATE);
  await birthDate.press("Enter");
  await assertLiveCounter(page);
  await assertUniformLifeGrid(page);

  await page.locator("#gear").click();
  await page.locator("body.screen-settings").waitFor({ state: "visible" });
  await page.locator('[data-preset="Paper"]').click();
  await page.waitForFunction(
    async ({ birth, background }) => {
      const { mortality } = await chrome.storage.local.get("mortality");
      return mortality?.birth === birth && mortality?.theme?.bg === background;
    },
    { birth: SAVED_BIRTH, background: PAPER_BACKGROUND },
  );

  await page.keyboard.press("Escape");
  await assertLiveCounter(page);
  assert.equal(
    await page.locator("#gear").evaluate((element) => {
      return document.activeElement === element;
    }),
    true,
  );

  const persistedPage = await openNewTab(context);
  await assertLiveCounter(persistedPage);
  await persistedPage.reload();
  await assertLiveCounter(persistedPage);
  await persistedPage.locator("#gear").click();
  await persistedPage
    .locator("body.screen-settings")
    .waitFor({ state: "visible" });
  assert.equal(
    await persistedPage
      .locator('[data-preset="Paper"]')
      .getAttribute("aria-pressed"),
    "true",
  );
}

const userDataDir = await mkdtemp(
  path.join(os.tmpdir(), "mortality-chromium-"),
);
const errors = [];
let context;

try {
  context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: true,
    locale: "en-US",
    reducedMotion: "reduce",
    timezoneId: "UTC",
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  });
  await runSmoke(context);
} catch (error) {
  errors.push(error);
}

try {
  await context?.close();
} catch (error) {
  errors.push(error);
}

try {
  await rm(userDataDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
} catch (error) {
  errors.push(error);
}

if (errors.length === 1) throw errors[0];
if (errors.length > 1) {
  throw new AggregateError(errors, "Chromium smoke test and cleanup failed");
}

console.log("Chromium extension smoke test passed");
