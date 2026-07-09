import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The extension code touches the DOM, localStorage, getComputedStyle, etc.,
    // so tests run in a browser-like environment.
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["test/**/*.test.js"],
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
