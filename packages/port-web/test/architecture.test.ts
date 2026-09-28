// The Web PORT's boundaries (docs/CONTRACT.md, obligation 7; the audit's
// R8): it depends on neither NEXUS nor the MESH runtime, only on the
// render tree's types, and uses no browser globals.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = new URL("../src/", import.meta.url);
const files = readdirSync(src).filter((file) => file.endsWith(".ts"));
const sources = files.map((file) => [file, readFileSync(new URL(file, src), "utf8")] as const);
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as Record<string, Record<string, string> | undefined>;

// The source without comments or string and template literals, so prose can't match.
const codeOf = (source: string): string => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/gm, '""');

// Every module specifier imported or re-exported, with whether it's type-only.
const importsOf = (source: string): ReadonlyArray<{ readonly specifier: string; readonly typeOnly: boolean }> =>
  Array.from(source.matchAll(/^\s*(import|export)\s+(type\s+)?[^;]*?from\s+"([^"]+)"/gms), (match) => ({ specifier: match[3]!, typeOnly: match[2] !== undefined }));

describe("port-web's boundaries", () => {
  it("has sources to check", () => {
    expect(files).toContain("port.ts");
  });

  it("imports nothing but its own modules, and the render tree's types", () => {
    for (const [file, source] of sources) {
      for (const { specifier, typeOnly } of importsOf(source)) {
        if (specifier.startsWith("./")) {
          continue;
        }

        expect({ file, specifier, typeOnly }).toEqual({ file, specifier: "@valancex/mesh-runtime", typeOnly: true });
      }
    }
  });

  it("has no runtime dependencies; MESH's types come from the host's own mesh-runtime, as a peer", () => {
    expect(manifest["dependencies"]).toBeUndefined();
    expect(Object.keys(manifest["peerDependencies"] ?? {})).toEqual(["@valancex/mesh-runtime"]);
  });

  it("uses no browser globals: every DOM object comes from the container's document", () => {
    for (const [file, source] of sources) {
      expect({ file, globals: codeOf(source).match(/\b(window|document|globalThis|navigator|self|AbortController)\b/g) ?? [] }).toEqual({ file, globals: [] });
    }
  });

  // A DOM constructor from the running realm (an Event, an AbortController)
  // wouldn't belong to the container's document, as a test DOM showed.
  it("constructs no object of a platform realm", () => {
    for (const [file, source] of sources) {
      const constructed = Array.from(codeOf(source).matchAll(/\bnew\s+([A-Za-z_$][\w$]*)/g), (match) => match[1]);

      expect({ file, constructed: constructed.filter((name) => !["Map", "Set", "WeakMap", "WebRealizationError"].includes(name!)) }).toEqual({ file, constructed: [] });
    }
  });
});
