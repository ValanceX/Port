// The package README's code samples run, with their imports pointed at the source. A sample may use names it
// doesn't define (`render`, `next`, `port`, `document`...): this test supplies them, and a sample that uses any
// other name fails with a ReferenceError, so a sample can't drift into inventing one.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as web from "../src/index.js";
import * as server from "../src/server.js";
import { dom, handler, node, text, tree } from "./support.js";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: Array<string>) => (...values: Array<unknown>) => Promise<unknown>;
const modules: Record<string, unknown> = { "@valancex/port-web": web, "@valancex/port-web/server": server };

const blocks = [...readFileSync(new URL("../README.md", import.meta.url), "utf8").matchAll(/```ts\n([\s\S]*?)\n```/g)].map((match) => match[1]!);

/** Runs a sample: its imports become the source modules; `scope` is what it may use besides them. */
const run = async (sample: string, scope: Record<string, unknown>, tail = ""): Promise<unknown> => {
  const body = sample.replace(/^import\s+\{([^}]*)\}\s+from\s+"([^"]+)";?$/gm, (_, names: string, specifier: string) => {
    if (modules[specifier] === undefined) {
      throw new Error(`the sample imports ${specifier}, which is not the package`);
    }

    return `const {${names}} = __modules[${JSON.stringify(specifier)}];`;
  });
  const js = ts.transpileModule(`${body}\n${tail}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const names = Object.keys(scope);

  return new AsyncFunction("__modules", ...names, js)(modules, ...names.map((name) => scope[name]));
};

const primitives = {
  page: { element: "section", props: { title: web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", props: { disabled: web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
} satisfies web.WebPrimitives;
const treeOf = (title: string) => tree(node(1, "page", { title }, [text(2, "Hi"), node(3, "button", {}, [text(4, "Go")], { click: handler(1) })]));

describe("the package README's samples", () => {
  it("has the four samples these tests cover", () => {
    expect(blocks).toHaveLength(4);
  });

  it("the first sample draws, updates and unmounts", async () => {
    const { window } = dom();

    window.document.body.innerHTML = '<div id="app"></div>';
    await run(blocks[0]!, { document: window.document, render: { tree: treeOf("one") }, next: { tree: treeOf("two") } });
    expect(window.document.querySelector("#app")!.childNodes).toHaveLength(0);
  });

  it("the server sample gives the HTML that the hydrate sample then adopts", async () => {
    const html = (await run(blocks[1]!, { render: { tree: treeOf("one") }, primitives }, "return html;")) as string;

    expect(html).toContain("<button");
    const { window, container } = dom();

    container.innerHTML = html;
    const port = web.createWebPort({ container, primitives, report: () => {} });
    const result = (await run(blocks[2]!, { port, render: { tree: treeOf("one") }, next: { tree: treeOf("two") } }, "return result;")) as { adopted: boolean };

    expect(result.adopted).toBe(true);
    expect(window.document.querySelector("section")!.getAttribute("aria-label")).toBe("two");
  });

  it("the error-handling sample reads the code and key of a refusal", async () => {
    const { container } = dom();
    const port = web.createWebPort({ container, primitives, report: () => {} });
    const logged: Array<unknown> = [];

    await run(blocks[3]!, { port, next: { tree: treeOf("two") }, console: { error: (...args: Array<unknown>) => logged.push(args) } });
    expect(logged).toEqual([["not-drawn", undefined]]);
  });
});
