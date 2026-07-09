import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The extension code touches the DOM, localStorage, getComputedStyle, etc.,
    // so tests run in a browser-like environment.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
    // clearMocks resets every mock's call history before each test. Vitest 4
    // narrowed restoreMocks so it only restores spied-on implementations and no
    // longer clears mock.calls, so persistent stubs (e.g. the setup's
    // Element.prototype.animate) would otherwise leak calls across tests.
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // tab.js is the browser entry point; its ambient-canvas rendering is
      // presentation glue that can't run meaningfully under jsdom.
      reporter: ["text", "html"],
    },
  },
});
