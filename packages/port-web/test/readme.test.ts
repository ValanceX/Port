// The package README's code samples run, with their imports pointed at the source. A sample may use names it
// doesn't define (`render`, `next`, `port`, `document`...): this test supplies them, and a sample that uses any
// other name fails with a ReferenceError, so a sample can't drift into inventing one.
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { describe, expect, it } from "vitest";

import * as mesh from "@valancex/mesh-runtime";
import * as web from "../src/index.js";
import * as server from "../src/server.js";
import { dom, handler, node, read, readJson, slicePrimitives, sliceProgram, text, tree } from "./support.js";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: Array<string>) => (...values: Array<unknown>) => Promise<unknown>;
// The composer sample imports the vocabulary, but its program is the slice's (`page`, `avatar`), which the portable core has no words for: here the import is the slice's table (vocabulary.test.ts runs the real one).
const modules: Record<string, unknown> = { "@valancex/mesh-runtime": mesh, "@valancex/port-web": web, "@valancex/port-web/server": server, "@valancex/port-web/vocabulary": { vocabulary: slicePrimitives } };

const blocks = [...readFileSync(new URL("../README.md", import.meta.url), "utf8").matchAll(/```ts\n([\s\S]*?)\n```/g)].map((match) => match[1]!);

/** Runs a sample: its imports become the source modules; `scope` is what it may use besides them. */
const run = async (sample: string, scope: Record<string, unknown>, tail = ""): Promise<unknown> => {
  const body = sample.replace(/^import\s+\{([^}]*)\}\s+from\s+"([^"]+)";?$/gm, (_, names: string, specifier: string) => {
    if (modules[specifier] === undefined) {
      throw new Error(`the sample imports ${specifier}, which is not the package`);
    }

    return `const {${names}} = __modules[${JSON.stringify(specifier)}];`;
  });
  const names = Object.keys(scope);
  // Node strips the types (TypeScript 7 has no `transpileModule`). It parses a module, where a sample's own
  // `return` is not allowed, so the sample is stripped as the body of a function and that function is called.
  const js = `${stripTypeScriptTypes(`async function __sample(__modules, ${names.join(", ")}) {\n${body}\n${tail}\n}`)}\nreturn __sample(__modules, ${names.join(", ")});`;

  return new AsyncFunction("__modules", ...names, js)(modules, ...names.map((name) => scope[name]));
};

const primitives = {
  page: { element: "section", props: { title: web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", props: { disabled: web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
} satisfies web.WebPrimitives;
const treeOf = (title: string) => tree(node(1, "page", { title }, [text(2, "Hi"), node(3, "button", {}, [text(4, "Go")], { click: handler(1) })]));

describe("the package README's samples", () => {
  it("has the five samples these tests cover", () => {
    expect(blocks).toHaveLength(5);
  });

  it("the composer sample shows a snapshot, then another in place, and closes", async () => {
    const { window } = dom();

    window.document.body.innerHTML = '<div id="app"></div>';
    const app = window.document.querySelector("#app")!;
    const scope = { document: window.document, program: await sliceProgram(), manifest: read("components.json"), primitives: slicePrimitives, snapshot: readJson("snapshots/first.json"), next: readJson("snapshots/second.json") };

    // Without its last line, to see what the container holds; with it, the container is empty.
    await run(blocks[0]!.replace("composer.close();", "return composer;"), scope);
    expect(app.querySelector("span")!.textContent).toBe("Ada King");
    await run(blocks[0]!, scope);
    expect(app.childNodes).toHaveLength(0);
  });

  it("the first sample draws, updates and unmounts", async () => {
    const { window } = dom();

    window.document.body.innerHTML = '<div id="app"></div>';
    await run(blocks[1]!, { document: window.document, render: { tree: treeOf("one") }, next: { tree: treeOf("two") } });
    expect(window.document.querySelector("#app")!.childNodes).toHaveLength(0);
  });

  it("the server sample gives the HTML that the hydrate sample then adopts", async () => {
    const html = (await run(blocks[2]!, { render: { tree: treeOf("one") }, primitives }, "return html;")) as string;

    expect(html).toContain("<button");
    const { window, container } = dom();

    container.innerHTML = html;
    const port = web.createWebPort({ container, primitives, report: () => {} });
    const result = (await run(blocks[3]!, { port, render: { tree: treeOf("one") }, next: { tree: treeOf("two") } }, "return result;")) as { adopted: boolean };

    expect(result.adopted).toBe(true);
    expect(window.document.querySelector("section")!.getAttribute("aria-label")).toBe("two");
  });

  it("the error-handling sample reads the code and key of a refusal", async () => {
    const { container } = dom();
    const port = web.createWebPort({ container, primitives, report: () => {} });
    const logged: Array<unknown> = [];

    await run(blocks[4]!, { port, next: { tree: treeOf("two") }, console: { error: (...args: Array<unknown>) => logged.push(args) } });
    expect(logged).toEqual([["not-drawn", undefined]]);
  });
});
