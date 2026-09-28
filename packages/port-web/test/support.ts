// Test support: a DOM of the test's own, real MESH trees from MESH's slice,
// the slice's primitives as the Web realizes them, and small hand-written
// render-v1 trees for the edge cases the slice doesn't reach.
import type { BoundaryValue, RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { compile } from "@valancex/mesh-compiler";
import { render } from "@valancex/mesh-runtime";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

import { attribute, booleanAttribute } from "../src/index.js";

const slice = new URL("../../../fixtures/mesh-slice/", import.meta.url);

export const read = (path: string): string => readFileSync(new URL(path, slice), "utf8");
export const readJson = (path: string): unknown => JSON.parse(read(path));

/** A document of its own, and a container in it. */
export const dom = (): { readonly window: JSDOM["window"]; readonly container: Element } => {
  const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>");

  return { window, container: window.document.querySelector("main")! };
};

/** Compiles MPRX sources against the slice's manifest, as a build would. */
export const program = async (sources: Readonly<Record<string, string>>, root: string): Promise<{ readonly root: string; readonly templates: ReadonlyArray<string> }> => {
  const manifest = read("components.json");
  const templates: Array<string> = [];

  for (const [component, source] of Object.entries(sources)) {
    const result = await compile({ source, path: `${component}.mprx`, model: { manifest, path: "components.json", component } });

    if (result.template === undefined) {
      throw new Error(`${component} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
    }

    templates.push(JSON.stringify(result.template));
  }

  return { root, templates };
};

/** Renders `snapshot` with the real MESH runtime, and returns the tree. */
export const treeOf = async (compiled: Awaited<ReturnType<typeof program>>, snapshot: unknown): Promise<RenderTree> => {
  const result = await render({ program: { root: compiled.root, templates: [...compiled.templates] }, model: read("components.json"), snapshot: snapshot as Record<string, unknown> });

  if (result.diagnostics !== undefined) {
    throw new Error(JSON.stringify(result.diagnostics));
  }

  return result.render.tree;
};

/** The slice's program, as MESH ships it. */
export const sliceProgram = () => program({ users: read("users.mprx"), "user-card": read("user-card.mprx") }, "users");

/** The slice's primitives, as this test application realizes them on the Web. */
export const slicePrimitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  avatar: {
    element: "img",
    props: { src: attribute("src"), alt: attribute("alt"), size: attribute("data-size") },
    // The manifest declares `click`'s payload as Press { x, y }.
    events: { click: { type: "click", payload: (event) => ({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }) } },
  },
  button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
};

// ---------------------------------------------------------------------------
// Hand-written render-v1 trees. Keys and handler identifiers follow the
// schema's patterns; their content is arbitrary, as it's opaque.

export const key = (n: number): string => `k${String(n).padStart(22, "A")}`;
export const handler = (n: number): string => `hAAAAAAAAAAA.${String(n).padStart(22, "A")}`;

export const node = (n: number, component: string, props: Readonly<Record<string, BoundaryValue>> = {}, children: ReadonlyArray<RenderNode | TextRun> = [], events: Readonly<Record<string, string>> = {}): RenderNode =>
  ({ type: "node", key: key(n), component, props, events, children });

export const text = (n: number, value: string): TextRun => ({ type: "text", key: key(n), text: value });

export const tree = (root: RenderNode): RenderTree => ({ format: "mesh-render", version: 1, root });

/** Every DOM node under `root`, in document order, `root` included. */
export const domNodes = (root: Node): ReadonlyArray<Node> => [root, ...Array.from(root.childNodes).flatMap(domNodes)];

/** Records every report the PORT makes, with exactly the arguments it was given. */
export const reports = (): { readonly calls: Array<ReadonlyArray<unknown>>; readonly report: (...args: [string, BoundaryValue?]) => void } => {
  const calls: Array<ReadonlyArray<unknown>> = [];

  return { calls, report: (...args) => { calls.push(args); } };
};
