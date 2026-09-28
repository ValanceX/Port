// MESH v0.6's conformance vectors (fixtures/mesh-conformance, a verbatim
// copy of MESH's examples/conformance), through the Web PORT and a real DOM.
// Each program is compiled and rendered with the published compiler and
// runtime, and must give MESH's committed tree; then every value case must
// be realized, and every event case resolved, exactly as MESH gives it.
import type { Render, RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { compile } from "@valancex/mesh-compiler";
import { dispatch, render } from "@valancex/mesh-runtime";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { attribute, createWebPort, property } from "../src/index.js";

import { dom, domNodes, reports } from "./support.js";

const vectors = new URL("../../../fixtures/mesh-conformance/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, vectors), "utf8");
const readJson = <T>(path: string): T => JSON.parse(read(path)) as T;
const manifest = read("components.json");

const renderOf = async (dir: string): Promise<Render> => {
  const { root, templates } = readJson<{ root: string; templates: Array<string> }>(`${dir}/program.json`);
  const compiled: Array<string> = [];

  for (const component of templates) {
    const result = await compile({ source: read(`${dir}/${component}.mprx`), path: `${component}.mprx`, model: { manifest, path: "components.json", component } });

    if (result.template === undefined) {
      throw new Error(`${component} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
    }

    compiled.push(JSON.stringify(result.template));
  }

  const result = await render({ program: { root, templates: compiled }, model: manifest, snapshot: readJson(`${dir}/snapshot.json`) });

  if (result.diagnostics !== undefined) {
    throw new Error(JSON.stringify(result.diagnostics));
  }

  return result.render;
};

/** Every node and text run, in document order. */
const partsOf = (part: RenderNode | TextRun): ReadonlyArray<RenderNode | TextRun> =>
  part.type === "text" ? [part] : [part, ...part.children.flatMap(partsOf)];

const nodeByKey = (tree: RenderTree, key: string): RenderNode =>
  partsOf(tree.root).find((part): part is RenderNode => part.type === "node" && part.key === key)!;

// ---------------------------------------------------------------------------

type Presence<T> = { readonly absent: true } | T;

interface ValueCase {
  readonly case: string;
  readonly node?: string;
  readonly prop?: string;
  readonly value?: Presence<{ readonly value: unknown }>;
  readonly propText?: Presence<{ readonly text: string }>;
  readonly textRun?: string;
  readonly text?: string;
  readonly states?: ReadonlyArray<{ readonly state: string; readonly node: string; readonly exactly: Record<string, unknown> }>;
}

describe("MESH conformance: values (§9.7.7, §9.8.2, §9.8.7)", () => {
  let values: Render;
  const cases = readJson<ReadonlyArray<ValueCase>>("values/cases.json");

  beforeAll(async () => {
    values = await renderOf("values");
  });

  it("the published runtime gives MESH's committed tree, propText included", () => {
    expect(values.tree).toEqual(readJson("values/expected.tree.json"));
  });

  /** Draws the case's node alone, with `prop` in a text-only slot and every other prop natively. */
  const drawAlone = (node: RenderNode, prop: string) => {
    const { container } = dom();
    const others = Object.fromEntries(Object.keys(node.props).map((name) => [name, property(`x-${name}`, "value")]));
    const primitives: WebPrimitives = { [node.component]: { element: "div", props: { ...others, [prop]: attribute(`data-${prop}`) } } };
    const port = createWebPort({ container, primitives, report: () => {} });

    try {
      port.draw({ format: "mesh-render", version: 1, root: node });
    } catch (error) {
      return { refused: (error as { readonly code: string }).code };
    }

    return { attribute: (container.firstChild as Element).getAttribute(`data-${prop}`) };
  };

  for (const vector of cases.filter((c) => c.prop !== undefined)) {
    it(`in a text-only slot: ${vector.case}`, () => {
      const node = nodeByKey(values.tree, vector.node!);
      const result = drawAlone(node, vector.prop!);

      if ("absent" in vector.value!) {
        expect(result).toEqual({ attribute: null });
      } else if ("text" in vector.propText!) {
        expect(result).toEqual({ attribute: vector.propText.text });
      } else if (typeof vector.value!.value === "string") {
        expect(result).toEqual({ attribute: vector.value!.value });
      } else {
        // A list or a record: no text, so a text-only slot refuses it.
        expect(result).toEqual({ refused: "unrealizable-value" });
      }
    });

    if (!("absent" in vector.value!)) {
      it(`in a native slot: ${vector.case}`, () => {
        const node = nodeByKey(values.tree, vector.node!);
        const { container } = dom();
        const props = Object.fromEntries(Object.keys(node.props).map((name) => [name, property(`x-${name}`, "value")]));
        createWebPort({ container, primitives: { [node.component]: { element: "div", props } }, report: () => {} })
          .draw({ format: "mesh-render", version: 1, root: node });

        expect((container.firstChild as unknown as Record<string, unknown>)[`x-${vector.prop}`]).toEqual((vector.value as { readonly value: unknown }).value);
      });
    }
  }

  const run = cases.find((c) => c.textRun !== undefined)!;

  it(`as content: ${run.case}`, () => {
    const { container } = dom();
    const native = { element: "div", props: Object.fromEntries(["label", "value", "flag", "empty", "note", "items", "point", "extra"].map((name) => [name, property(`x-${name}`, "value")])) };
    const primitives: WebPrimitives = { page: { element: "div" }, text: { element: "span" }, field: native, cell: native };
    createWebPort({ container, primitives, report: () => {} }).draw(values.tree);

    const index = partsOf(values.tree.root).findIndex((part) => part.key === run.textRun);
    expect(domNodes(container.firstChild!)[index]!.textContent).toBe(run.text);
  });

  const states = cases.find((c) => c.states !== undefined)!;

  it(`${states.case}: each node exactly, and each realized distinctly`, () => {
    const realized = states.states!.map(({ node: key, exactly }) => {
      const node = nodeByKey(values.tree, key);
      expect({ props: node.props, ...(node.propText === undefined ? {} : { propText: node.propText }) }).toEqual(exactly);

      return drawAlone(node, "value");
    });

    expect(realized).toEqual([{ attribute: null }, { attribute: "null" }, { attribute: "hello" }]);
  });
});

// ---------------------------------------------------------------------------

interface EventCase {
  readonly case: string;
  readonly interaction: { readonly target: string; readonly applicable: Readonly<Record<string, string>> };
  readonly expect: { readonly none: true } | { readonly node: string; readonly event: string; readonly handler: string; readonly intent: unknown };
}

describe("MESH conformance: event resolution (§9.9)", () => {
  let events: Render;
  const cases = readJson<ReadonlyArray<EventCase>>("events/cases.json");
  const components = (JSON.parse(manifest) as { components: Record<string, { events: Record<string, unknown> }> }).components;
  const elements: Readonly<Record<string, string>> = { card: "section", row: "div", button: "button", label: "span" };

  beforeAll(async () => {
    events = await renderOf("events");
  });

  it("the published runtime gives MESH's committed tree", () => {
    expect(events.tree).toEqual(readJson("events/expected.tree.json"));
  });

  for (const vector of cases) {
    it(vector.case, async () => {
      // The PORT's mapping for this case: the one DOM interaction the case
      // is constitutes each primitive's applicable event, and each other
      // event of the primitive is some other interaction.
      const primitives: WebPrimitives = Object.fromEntries(Object.entries(elements).map(([component, element]) => [component, {
        element,
        events: Object.fromEntries(Object.keys(components[component]!.events).map((event) =>
          [event, { type: vector.interaction.applicable[component] === event ? "valance-interaction" : `other-${event}` }])),
      }]));
      const { window, container } = dom();
      const { calls, report } = reports();
      createWebPort({ container, primitives, report }).draw(events.tree);

      // The tree's parts and the drawn DOM nodes, in the same order.
      const target = domNodes(container.firstChild!)[partsOf(events.tree.root).findIndex((part) => part.key === vector.interaction.target)]!;
      // Not bubbling: resolution must not need the DOM's propagation.
      target.dispatchEvent(new window.Event("valance-interaction", { bubbles: false }));

      if ("none" in vector.expect) {
        expect(calls).toEqual([]);
      } else {
        expect(calls).toEqual([[vector.expect.handler]]);
        // The one report is one intent: MESH's, for the drawn render.
        const dispatched = await dispatch(events, vector.expect.handler);
        expect(dispatched).toEqual({ intent: vector.expect.intent });
      }
    });
  }
});
