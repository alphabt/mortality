// Test environment shims. jsdom implements the DOM but not every browser API the
// extension touches, and Node 25 injects its own experimental `localStorage`
// global that misbehaves here — so we install deterministic stubs. Individual
// tests override them (e.g. matchMedia matches, or a chrome.storage mock).
import { vi, beforeEach } from "vitest";

// A spec-shaped in-memory Storage, so store.js's localStorage fallback behaves
// identically across Node/jsdom versions.
class MemoryStorage {
  #map = new Map();
  get length() {
    return this.#map.size;
  }
  key(i) {
    return Array.from(this.#map.keys())[i] ?? null;
  }
  getItem(k) {
    return this.#map.has(String(k)) ? this.#map.get(String(k)) : null;
  }
  setItem(k, v) {
    this.#map.set(String(k), String(v));
  }
  removeItem(k) {
    this.#map.delete(String(k));
  }
  clear() {
    this.#map.clear();
  }
}

function installStorage() {
  const store = new MemoryStorage();
  for (const target of [globalThis, window]) {
    Object.defineProperty(target, "localStorage", {
      value: store,
      configurable: true,
      writable: true,
    });
  }
}

function stubMatchMedia(matches = false) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// A minimal 2D context so the ambient-glow canvas code in tab.js can run
// headless. getImageData returns a tiny buffer — no test inspects the pixels.
function stubCanvas() {
  const ctx = {
    fillStyle: "",
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
}

function stubAnimate() {
  if (typeof Element.prototype.animate !== "function") {
    Element.prototype.animate = vi.fn(() => ({
      cancel: vi.fn(),
      finished: Promise.resolve(),
    }));
  }
}

beforeEach(() => {
  installStorage();
  stubMatchMedia(false);
  stubCanvas();
  stubAnimate();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("class");
  document.body.className = "";
  document.body.innerHTML = "";
});
