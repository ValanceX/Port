import { defineConfig } from "vitest/config";

// No DOM environment: each test makes its own JSDOM and hands the PORT a
// container, so the PORT can't lean on browser globals by accident.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
