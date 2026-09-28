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

// The built package, as consumers load it: the server entry's module graph
// holds no DOM realization (port.js), no NEXUS and no integration code.
describe("the built server entry", () => {
  const dist = new URL("../node_modules/@valancex/port-web/dist/", import.meta.url);
  const graphOf = (entry: string): ReadonlyArray<string> => {
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (!seen.has(file)) {
        seen.add(file);
        const source = readFileSync(new URL(file, dist), "utf8");
        for (const [, specifier] of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+"([^"]+)"/gms)) {
          seen.add(specifier!.startsWith("./") ? "" : specifier!);
          if (specifier!.startsWith("./")) {
            visit(specifier!.slice(2));
          }
        }
      }
    };

    visit(entry);
    seen.delete("");

    return [...seen].sort();
  };

  it("loads only the shared modules and the HTML writer", () => {
    expect(graphOf("server.js")).toEqual(["check.js", "error.js", "html.js", "primitives.js", "realize.js", "server.js"]);
  });

  it("the client entry loads the DOM realization and the same shared modules", () => {
    expect(graphOf("index.js")).toEqual(["check.js", "error.js", "index.js", "port.js", "primitives.js", "realize.js"]);
  });
});
