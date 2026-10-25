// The Chromium tracer bullet (browser/): its own run, beside the jsdom/Node
// integration (vitest.config.ts), which it doesn't change. Playwright 1.64.1
// drives the Chromium revision it ships with; PLAYWRIGHT_BROWSERS_PATH points at it where
// it's pre-installed.
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["browser/**/*.test.ts"],
    globalSetup: ["browser/setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
