import { defineConfig } from "vitest/config";

// No DOM environment: each test makes its own JSDOM and hands the PORT a
// container, so the PORT can't lean on browser globals by accident.
//
// MESH_PACKAGES names a directory whose node_modules holds the `@valancex/mesh-compiler` and
// `@valancex/mesh-runtime` to test against instead of the workspace's (scripts/check-mesh-range.mjs
// uses it to run this suite once per minor the peer range claims). Unset, the workspace's are used.
const packages = process.env.MESH_PACKAGES;

export default defineConfig({
  resolve: {
    alias:
      packages === undefined
        ? {}
        : {
            "@valancex/mesh-compiler": `${packages}/node_modules/@valancex/mesh-compiler`,
            "@valancex/mesh-runtime": `${packages}/node_modules/@valancex/mesh-runtime`,
          },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
