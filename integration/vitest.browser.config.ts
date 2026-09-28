// The Chromium tracer bullet (browser/): its own run, beside the jsdom/Node
// integration (vitest.config.ts), which it doesn't change. Playwright 1.56.1
// drives Chromium revision 1194; PLAYWRIGHT_BROWSERS_PATH points at it where
// it's pre-installed.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["browser/**/*.test.ts"],
    globalSetup: ["browser/setup.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      headless: true,
      instances: [{ browser: "chromium" }],
    },
  },
});
