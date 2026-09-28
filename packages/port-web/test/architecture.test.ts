// The Web PORT's boundaries (docs/CONTRACT.md, obligation 7; the audit's
// R8): it depends on neither NEXUS nor the MESH runtime, only on the
// render tree's types, and uses no browser globals.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as client from "../src/index.js";
import * as server from "../src/server.js";

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

// The server entry (docs/superpowers/specs/2026-09-28-port-web-ssr.md §4.1):
// DOM-free, sharing the table, its validation, the tree check and value
// realization with the client, and never loading the client's DOM code.
describe("the server entry's boundaries", () => {
  const byFile = new Map(sources);
  const graphOf = (entry: string): ReadonlySet<string> => {
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (!seen.has(file)) {
        seen.add(file);
        importsOf(byFile.get(file)!).filter(({ specifier }) => specifier.startsWith("./")).forEach(({ specifier }) => visit(specifier.slice(2).replace(/\.js$/, ".ts")));
      }
    };

    visit(entry);

    return seen;
  };
  const server = graphOf("server.ts");

  it("loads the shared modules and the HTML writer, and not the DOM realization", () => {
    expect([...server].sort()).toEqual(["check.ts", "error.ts", "html.ts", "primitives.ts", "realize.ts", "server.ts"]);
  });

  it("the client entry shares the same check and realization", () => {
    expect([...graphOf("index.ts")]).toEqual(expect.arrayContaining(["check.ts", "realize.ts", "primitives.ts", "error.ts", "port.ts"]));
  });

  // Type annotations (an event payload builder takes an `Element`) are erased: only run-time use counts.
  it("uses no DOM API at run time", () => {
    for (const file of server) {
      const dom = codeOf(byFile.get(file)!).match(/\b(ownerDocument|createElement|createTextNode|setAttribute|appendChild|addEventListener|innerHTML|outerHTML|childNodes|parentNode|DOMParser|XMLSerializer)\b|\bnew\s+(Text|Element|Node|Event)\b/g) ?? [];

      expect({ file, dom }).toEqual({ file, dom: [] });
    }
  });

  it("makes no text of a value: no String() or JSON.stringify in the HTML writer or value realization", () => {
    for (const file of ["html.ts", "realize.ts"]) {
      expect({ file, calls: codeOf(byFile.get(file)!).match(/\bString\s*\(|JSON\s*\.\s*stringify/g) ?? [] }).toEqual({ file, calls: [] });
    }
  });
});

// The public surface: the client and server entries, and nothing else. The
// shared checks, value realization, HTML escaping and hydration's
// verification are internal.
describe("the public API surface", () => {
  it("the package exposes only its two entries", () => {
    expect(Object.keys((manifest["exports"] ?? {}) as Record<string, unknown>)).toEqual([".", "./server", "./package.json"]);
  });

  it("the client entry: the Web PORT, the realization table's helpers, and its error", () => {
    expect(Object.keys(client).sort()).toEqual(["UNKNOWN_COMPONENT_ELEMENT", "WebRealizationError", "attribute", "booleanAttribute", "createWebPort", "property", "textProperty"]);
  });

  it("the server entry: realizeHtml, the realization table's helpers, and the same error", () => {
    expect(Object.keys(server).sort()).toEqual(["WebRealizationError", "attribute", "booleanAttribute", "property", "realizeHtml", "textProperty"]);
    expect(server.WebRealizationError).toBe(client.WebRealizationError);
  });
});
