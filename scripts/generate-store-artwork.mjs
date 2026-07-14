import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const PREVIEW_URL = process.env.PREVIEW_URL || "http://127.0.0.1:4173/";
const CAPTURED_AT = Date.parse("2026-07-12T12:00:00Z");
const SYNTHETIC_BIRTH = "1990-04-18T06:30";
const SCREENSHOT_SIZE = { width: 1280, height: 800 };

const THEMES = {
  Light: {
    bg: "#ffffff",
    label: "#6f747a",
    count: "#494949",
    accent: "#007ea6",
  },
  Dark: {
    bg: "#222222",
    label: "#898f97",
    count: "#b0b5b9",
    accent: "#007ea6",
  },
  Paper: {
    bg: "#fafaf8",
    label: "#5f6469",
    count: "#1b1b1b",
    accent: "#b23a2e",
  },
  Blueprint: {
    bg: "#0e1b2a",
    label: "#8398ad",
    count: "#e6ecf2",
    accent: "#5a9be0",
  },
};

function profile(theme, mode = "years", typeface = "system") {
  return {
    version: 1,
    birth: SYNTHETIC_BIRTH,
    birthZone: "UTC",
    theme,
    expectancy: 82,
    expectancySource: "custom",
    sex: null,
    lifeTable: "world",
    mode,
    typeface,
    reflection: false,
    language: "en",
  };
}

const SCREENSHOTS = [
  {
    id: "light-counter",
    output: "store-assets/final/01-light-counter.png",
    state: profile(THEMES.Light),
    screen: "counter",
  },
  {
    id: "life-in-weeks",
    output: "store-assets/final/02-life-in-weeks.png",
    state: profile(THEMES.Blueprint),
    screen: "weeks",
  },
  {
    id: "next-birthday",
    output: "store-assets/final/03-next-birthday.png",
    state: profile(THEMES.Paper, "birthday", "grotesk"),
    screen: "counter",
  },
  {
    id: "settings-personalization",
    output: "store-assets/final/04-settings-personalization.png",
    state: profile(THEMES.Blueprint, "years", "mono"),
    screen: "settings",
  },
  {
    id: "dark-counter",
    output: "store-assets/final/05-dark-counter.png",
    state: profile(THEMES.Dark),
    screen: "counter",
  },
];

const STORE_ICONS = [128, 300].map((size) => ({
  source: "store-assets/source/icon.svg",
  output: `store-assets/final/icon-${size}.png`,
  size,
}));

const PROMOS = [
  {
    source: "store-assets/source/small-promo.svg",
    output: "store-assets/final/small-promo-440x280.png",
    width: 440,
    height: 280,
  },
  {
    source: "store-assets/source/marquee.svg",
    output: "store-assets/final/marquee-1400x560.png",
    width: 1400,
    height: 560,
  },
  {
    source: "store-assets/source/social-preview.svg",
    output: "store-assets/final/social-preview-1200x630.png",
    width: 1200,
    height: 630,
  },
];

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) {
          pending.reject(
            new Error(
              `${pending.method}: ${message.error.message || "CDP command failed"}`,
            ),
          );
        } else {
          pending.resolve(message.result || {});
        }
        return;
      }

      const listeners = this.events.get(message.method);
      if (!listeners?.length) return;
      this.events.delete(message.method);
      listeners.forEach((resolve) => resolve(message.params || {}));
    });

    socket.addEventListener("close", () => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Chrome closed before ${pending.method}`));
      }
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await withTimeout(
      new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener("open", resolveOpen, { once: true });
        socket.addEventListener(
          "error",
          () => rejectOpen(new Error(`Could not connect to Chrome at ${url}`)),
          { once: true },
        );
      }),
      5000,
      "Chrome DevTools connection",
    );
    return new CdpClient(socket);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolveCommand, rejectCommand) => {
      this.pending.set(id, {
        method,
        resolve: resolveCommand,
        reject: rejectCommand,
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolveEvent) => {
      const listeners = this.events.get(method) || [];
      listeners.push(resolveEvent);
      this.events.set(method, listeners);
    });
  }

  close() {
    this.socket.close();
  }
}

function withTimeout(promise, timeoutMs, label) {
  let timeout;
  const timed = new Promise((_, rejectTimeout) => {
    timeout = setTimeout(
      () => rejectTimeout(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timed]).finally(() => clearTimeout(timeout));
}

async function findBrowser() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/opt/google/chrome/chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
    "/opt/microsoft/msedge/msedge",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "EACCES") throw error;
    }
  }
  throw new Error(
    "Chrome or Edge was not found. Set CHROME_BIN to a Chromium executable.",
  );
}

async function waitForDevTools(profileDir, child, stderr) {
  const activePortFile = join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(
        `Chrome exited before DevTools was ready.\n${stderr.value.trim()}`,
      );
    }
    try {
      const [port] = (await readFile(activePortFile, "utf8"))
        .trim()
        .split("\n");
      if (/^\d+$/.test(port)) return Number(port);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error("Chrome DevTools did not become ready");
}

function waitForSpawn(child) {
  return withTimeout(
    new Promise((resolveSpawn, rejectSpawn) => {
      child.once("spawn", resolveSpawn);
      child.once("error", rejectSpawn);
    }),
    5000,
    "Chrome process startup",
  );
}

function waitForExit(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolveExit, rejectExit) => {
    child.once("exit", resolveExit);
    child.once("error", rejectExit);
  });
}

async function stopChrome(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  try {
    await withTimeout(waitForExit(child), 5000, "Chrome shutdown");
  } catch (shutdownError) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await withTimeout(waitForExit(child), 5000, "Chrome forced shutdown");
    }
    throw shutdownError;
  }
}

async function cleanupChrome(child, profileDir) {
  const errors = [];
  try {
    await stopChrome(child);
  } catch (error) {
    errors.push(error);
  }
  try {
    await rm(profileDir, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }

  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Chrome cleanup failed");
  }
}

async function launchChrome() {
  const executable = await findBrowser();
  const profileDir = await mkdtemp(join(tmpdir(), "mortality-store-artwork-"));
  const stderr = { value: "" };
  let child;
  try {
    child = spawn(
      executable,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-extensions",
        "--disable-sync",
        "--force-device-scale-factor=1",
        "--no-default-browser-check",
        "--no-first-run",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr.value += chunk;
    });

    await waitForSpawn(child);
    const port = await waitForDevTools(profileDir, child, stderr);
    return { child, port, profileDir };
  } catch (startupError) {
    try {
      await cleanupChrome(child, profileDir);
    } catch (cleanupError) {
      throw new AggregateError(
        [startupError, cleanupError],
        "Chrome startup and cleanup failed",
      );
    }
    throw startupError;
  }
}

async function createTarget(port) {
  const response = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  if (!response.ok) {
    throw new Error(`Chrome target creation failed with ${response.status}`);
  }
  const target = await response.json();
  assert.equal(
    typeof target.webSocketDebuggerUrl,
    "string",
    "Chrome did not return a target WebSocket URL",
  );
  return CdpClient.connect(target.webSocketDebuggerUrl);
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    screenWidth: width,
    screenHeight: height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  const result = await client.send("Page.navigate", { url });
  if (result.errorText) {
    throw new Error(`Could not navigate to ${url}: ${result.errorText}`);
  }
  await withTimeout(loaded, 10_000, `Loading ${url}`);
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail =
      result.exceptionDetails.exception?.description ||
      result.exceptionDetails.text ||
      "JavaScript evaluation failed";
    throw new Error(detail);
  }
  return result.result?.value;
}

async function waitFor(client, expression, label) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function initScript() {
  const fixtures = Object.fromEntries(
    SCREENSHOTS.map(({ id, state }) => [id, { now: CAPTURED_AT, state }]),
  );
  return `(() => {
    const fixture = ${JSON.stringify(fixtures)}[
      new URLSearchParams(location.search).get("capture")
    ];
    if (!fixture || !/^https?:$/.test(location.protocol)) return;
    localStorage.setItem("mortality", JSON.stringify(fixture.state));
    const NativeDate = Date;
    globalThis.Date = class Date extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixture.now]));
      }
      static now() {
        return fixture.now;
      }
    };
    let seed;
    globalThis.__resetArtworkRandom = () => {
      seed = 0x4d4f5254;
    };
    globalThis.__resetArtworkRandom();
    Math.random = () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    globalThis.__artworkAmbientRevision = 0;
    const putImageData = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (...args) {
      const result = Reflect.apply(putImageData, this, args);
      if (this.canvas.id === "ambient") {
        globalThis.__artworkAmbientRevision += 1;
      }
      return result;
    };
  })();`;
}

async function prepareScreenshot(client, spec) {
  await setViewport(client, SCREENSHOT_SIZE.width, SCREENSHOT_SIZE.height);
  const url = new URL(PREVIEW_URL);
  url.searchParams.set("capture", spec.id);
  await navigate(client, url.href);
  await waitFor(
    client,
    `document.body.className === "screen-counter" &&
      Boolean(document.querySelector("#count")?.textContent.trim())`,
    `${spec.id} counter`,
  );

  if (spec.screen === "weeks") {
    const clicked = await evaluate(
      client,
      `(() => {
        const button = document.querySelector("#weeks-btn");
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    assert.equal(clicked, true, "Life-in-weeks control was not available");
  } else if (spec.screen === "settings") {
    const clicked = await evaluate(
      client,
      `(() => {
        const button = document.querySelector("#gear");
        if (!button) return false;
        button.click();
        return true;
      })()`,
    );
    assert.equal(clicked, true, "Settings control was not available");
  }

  await waitFor(
    client,
    `document.body.className === "screen-${spec.screen}"`,
    `${spec.id} ${spec.screen} screen`,
  );
  await evaluate(
    client,
    `Promise.all([
      document.fonts?.ready || Promise.resolve(),
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    ]).then(() => {
      window.scrollTo(0, 0);
      document.activeElement?.blur();
      return true;
    })`,
    true,
  );
  await waitFor(
    client,
    `document.querySelector("#ambient")?.style.opacity === "1"`,
    `${spec.id} ambient layer`,
  );
  const ambientRevision = await evaluate(
    client,
    `globalThis.__artworkAmbientRevision`,
  );
  await evaluate(
    client,
    `(() => {
      globalThis.__resetArtworkRandom();
      window.dispatchEvent(new Event("resize"));
      return true;
    })()`,
  );
  await waitFor(
    client,
    `globalThis.__artworkAmbientRevision > ${ambientRevision}`,
    `${spec.id} deterministic ambient repaint`,
  );
}

async function prepareStoreIcon(client, spec) {
  await setViewport(client, spec.size, spec.size);
  await navigate(client, pathToFileURL(resolve(ROOT, spec.source)).href);
  await waitFor(client, `document.readyState === "complete"`, spec.source);
  const resized = await evaluate(
    client,
    `(() => {
      const icon = document.documentElement;
      if (icon.localName !== "svg") return false;
      icon.setAttribute("width", "${spec.size}");
      icon.setAttribute("height", "${spec.size}");
      icon.style.display = "block";
      return true;
    })()`,
  );
  assert.equal(resized, true, `${spec.source} is not an SVG document`);
  await evaluate(
    client,
    `new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))
    )`,
    true,
  );
}

async function capture(client, output, width, height) {
  const { data } = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  const png = Buffer.from(data, "base64");
  assertPng(png, width, height, output);
  const file = resolve(ROOT, output);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, png);
}

function assertPng(buffer, width, height, label) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  assert.equal(
    buffer.subarray(0, signature.length).compare(signature),
    0,
    `${label} is not a PNG`,
  );
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(buffer.readUInt32BE(16), width, `${label} width`);
  assert.equal(buffer.readUInt32BE(20), height, `${label} height`);
}

function channel(value) {
  const srgb = value / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex
    .match(/[\da-f]{2}/gi)
    .map((value) => channel(Number.parseInt(value, 16)));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function verifyPalette() {
  for (const [name, theme] of Object.entries(THEMES)) {
    assert.ok(
      contrast(theme.label, theme.bg) >= 4.5,
      `${name} label contrast is below 4.5:1`,
    );
    assert.ok(
      contrast(theme.count, theme.bg) >= 4.5,
      `${name} counter contrast is below 4.5:1`,
    );
    assert.ok(
      contrast(theme.accent, theme.bg) >= 3,
      `${name} accent contrast is below 3:1`,
    );
  }
  assert.ok(
    contrast("#e6ecf2", "#0e1b2a") >= 4.5,
    "Promo counter contrast is below 4.5:1",
  );
  assert.ok(
    contrast("#8398ad", "#0e1b2a") >= 4.5,
    "Promo secondary-mark contrast is below 4.5:1",
  );
  assert.ok(
    contrast("#007ea6", "#0e1b2a") >= 3,
    "Promo live-point contrast is below 3:1",
  );
}

async function verifyPreview() {
  const response = await fetch(PREVIEW_URL);
  if (!response.ok) {
    throw new Error(
      `Preview at ${PREVIEW_URL} returned HTTP ${response.status}`,
    );
  }
  const html = await response.text();
  assert.match(
    html,
    /<script type="module" src="tab\.js"><\/script>/,
    "Preview is not serving the Mortality tab",
  );
}

async function render() {
  verifyPalette();
  await verifyPreview();
  const chrome = await launchChrome();
  let client;
  try {
    client = await createTarget(chrome.port);
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
    await client.send("Emulation.setLocaleOverride", { locale: "en-US" });
    await client.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
        { name: "prefers-color-scheme", value: "light" },
      ],
    });
    await client.send("Page.addScriptToEvaluateOnNewDocument", {
      source: initScript(),
    });

    for (const spec of SCREENSHOTS) {
      await prepareScreenshot(client, spec);
      await capture(
        client,
        spec.output,
        SCREENSHOT_SIZE.width,
        SCREENSHOT_SIZE.height,
      );
      console.log(`Created ${spec.output}`);
    }

    for (const promo of PROMOS) {
      await setViewport(client, promo.width, promo.height);
      await navigate(client, pathToFileURL(resolve(ROOT, promo.source)).href);
      await waitFor(client, `document.readyState === "complete"`, promo.source);
      await capture(client, promo.output, promo.width, promo.height);
      console.log(`Created ${promo.output}`);
    }

    await client.send("Emulation.setDefaultBackgroundColorOverride", {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    for (const icon of STORE_ICONS) {
      await prepareStoreIcon(client, icon);
      await capture(client, icon.output, icon.size, icon.size);
      console.log(`Created ${icon.output}`);
    }
  } finally {
    try {
      client?.close();
    } finally {
      await cleanupChrome(chrome.child, chrome.profileDir);
    }
  }
}

await render();
