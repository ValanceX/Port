// The dependency directions the slice relies on (NEXUS docs/ARCHITECTURE.md
// §16, MESH rule 13), checked against the packages as published and built.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Read from node_modules directly: a package's `exports` may not expose its package.json.
const manifestOf = (name: string): Record<string, Record<string, string> | undefined> =>
  JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), "utf8"));
const dependenciesOf = (name: string): ReadonlyArray<string> => {
  const manifest = manifestOf(name);

  return [...Object.keys(manifest["dependencies"] ?? {}), ...Object.keys(manifest["peerDependencies"] ?? {})];
};

describe("dependency directions", () => {
  it("PORT Web depends on neither NEXUS nor MESH's runtime code: only the render tree's types, as a peer", () => {
    expect(dependenciesOf("@valancex/port-web")).toEqual(["@valancex/mesh-runtime"]);
  });

  it("NEXUS doesn't depend on PORT", () => {
    expect(dependenciesOf("@valancex/nexus").filter((name) => name.startsWith("@valancex/port"))).toEqual([]);
  });
});
