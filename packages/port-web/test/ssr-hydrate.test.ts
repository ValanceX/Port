// Hydration (docs/superpowers/specs/2026-09-28-port-web-ssr.md §5–§9, §12):
// verify all, then adopt; on any mismatch, a fresh draw; either way the
// PORT is then exactly as after draw(tree). Events keep MESH's resolution.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort, property, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { domNodes, handler, node, reports, text, tree } from "./support.js";
import { codeOf, drawn, hydrated, parse, propertySlots, realized } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  para: { element: "p", props: { note: attribute("title"), hidden: booleanAttribute("hidden") } },
  image: { element: "img", props: { src: attribute("src") } },
  meter: { element: "progress", props: { amount: property("value", "number") } },
  level: { element: "valance-level", props: { amount: property("level", "number") } },
  field: { element: "input", props: { value: textProperty("value") } },
  button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
  card: { element: "div", events: { click: { type: "click" } } },
};

const slots = propertySlots(primitives);

const page = (children: ReadonlyArray<RenderNode | ReturnType<typeof text>>, title = "T"): RenderTree => tree(node(1, "page", { title }, children));

const sample = (label = "Go", note = "n"): RenderTree => page([
  node(2, "para", { note }, [text(3, "hello")]),
  node(4, "button", {}, [text(5, label)], { click: handler(1) }),
  text(6, ""),
]);

/** Hydrates `client` over server HTML realized from `server`, and checks the outcome is a complete fresh draw. */
const expectFreshDraw = (server: RenderTree | string, client: RenderTree) => {
  const html = typeof server === "string" ? server : realizeHtml(server, primitives);
  const ssr = hydrated(client, primitives, html);

  expect(ssr.result.adopted).toBe(false);
  // No server node survives, and the result is exactly draw(tree)'s.
  expect(ssr.survivors()).toEqual([]);
  expect(realized(ssr.container, slots)).toEqual(realized(drawn(client, primitives).container, slots));

  return ssr;
};

describe("hydrate: an exact match is adopted", () => {
  it("keeps every server node, and realizes exactly what draw does", () => {
    const ssr = hydrated(sample(), primitives);

    expect(ssr.result).toEqual({ adopted: true });
    expect(ssr.survivors()).toHaveLength(ssr.server.size);
    expect(realized(ssr.container, slots)).toEqual(realized(drawn(sample(), primitives).container, slots));
  });

  it("then updates in place: the server's nodes are the drawn tree's", () => {
    const ssr = hydrated(sample(), primitives);
    const [section, para, hello, button, go] = [...ssr.server];

    ssr.port.update(sample("Stop", "m"));

    expect(ssr.container.firstChild).toBe(section);
    expect([para, hello, button, go].every((server) => ssr.container.contains(server!))).toBe(true);
    expect((para as Element).getAttribute("title")).toBe("m");
    expect(button!.textContent).toBe("Stop");
    expect(realized(ssr.container, slots)).toEqual(realized(drawn(sample("Stop", "m"), primitives).container, slots));
  });

  it("changes nothing in the DOM but what HTML couldn't carry: empty text nodes and present properties", () => {
    const { container } = parse(realizeHtml(sample(), primitives));
    const writes: Array<string> = [];
    const observer = new container.ownerDocument.defaultView!.MutationObserver((records) => {
      writes.push(...records.map((record) => `${record.type}:${record.attributeName ?? ""}`));
    });
    observer.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });

    createWebPort({ container, primitives, report: () => {} }).hydrate(sample());
    const recorded = [...writes, ...observer.takeRecords().map((record) => `${record.type}:${record.attributeName ?? ""}`)];

    // One insertion: the empty text run after the button.
    expect(recorded).toEqual(["childList:"]);
  });
});

describe("hydrate: any mismatch is a complete fresh draw", () => {
  it("text mismatch", () => {
    expect(expectFreshDraw(sample("Go"), sample("Went")).result).toMatchObject({ mismatch: { class: "text", expected: 'the text "Went"', found: 'the text "Go"' } });
  });

  it("missing, extra and changed attributes", () => {
    const withNote = (note?: string) => page([node(2, "para", note === undefined ? {} : { note })]);

    expect(expectFreshDraw(withNote(), withNote("n")).result).toMatchObject({ mismatch: { class: "attribute", expected: 'title="n"', found: "no title" } });
    expect(expectFreshDraw(withNote("n"), withNote()).result).toMatchObject({ mismatch: { class: "attribute", expected: "no title", found: 'title="n"' } });
    expect(expectFreshDraw(withNote("a"), withNote("b")).result).toMatchObject({ mismatch: { class: "attribute" } });
    // An attribute no realization writes at all.
    expect(expectFreshDraw('<section aria-label="T" data-x="1"><p></p></section>', withNote()).result).toMatchObject({ mismatch: { class: "attribute", found: 'data-x="1"' } });
  });

  it("boolean attribute mismatch: presence either way, or a value", () => {
    const hidden = (value: boolean) => page([node(2, "para", { hidden: value })]);

    expect(expectFreshDraw(hidden(true), hidden(false)).result).toMatchObject({ mismatch: { class: "boolean-attribute" } });
    expect(expectFreshDraw(hidden(false), hidden(true)).result).toMatchObject({ mismatch: { class: "boolean-attribute" } });
    expect(expectFreshDraw('<section aria-label="T"><p hidden="hidden"></p></section>', hidden(true)).result).toMatchObject({ mismatch: { class: "boolean-attribute" } });
  });

  it("element mismatch", () => {
    expect(expectFreshDraw('<section aria-label="T"><div title="n">hello</div><button>Go</button></section>', sample()).result).toMatchObject({ mismatch: { class: "element", expected: "<p>", found: "<div>" } });
  });

  it("child-count mismatch", () => {
    expect(expectFreshDraw(page([node(2, "para", {}), node(3, "para", {})]), page([node(2, "para", {})])).result).toMatchObject({ mismatch: { class: "child-count" } });
  });

  it("reordered or changed keyed structure", () => {
    const a = page([node(2, "para", {}), node(3, "image", { src: "x" })]);
    const b = page([node(3, "image", { src: "x" }), node(2, "para", {})]);

    expect(expectFreshDraw(a, b).result).toMatchObject({ mismatch: { class: "element" } });
    expect(expectFreshDraw(page([node(2, "para", {}, [text(3, "x")])]), page([node(2, "para", {}, [node(3, "text", {})])])).result).toMatchObject({ mismatch: { class: "element" } });
  });

  it("container mismatch: anything around the root", () => {
    const html = realizeHtml(sample(), primitives);

    for (const around of [` ${html}`, `${html}\n`, `<!---->${html}`, `${html}${html}`, ""]) {
      expect(expectFreshDraw(around, sample()).result).toMatchObject({ mismatch: { class: "container" } });
    }
  });

  it("an unknown component standing for another component", () => {
    expect(expectFreshDraw(page([node(2, "alpha", {})]), page([node(2, "beta", {})])).result).toMatchObject({ mismatch: { class: "component" } });
  });

  it("a nesting the HTML parser restructures", () => {
    // A button inside a button: the parser closes the first at the second.
    const nested = page([node(2, "button", {}, [node(3, "button", {}, [text(4, "inner")])])]);

    expect(expectFreshDraw(nested, nested).result).toMatchObject({ mismatch: { class: "child-count" } });
  });

  it("is deterministic: the first mismatch in document order, every time", () => {
    const server = realizeHtml(page([node(2, "para", { note: "a" }, [text(3, "x")]), node(4, "image", { src: "a" })]), primitives);
    const client = page([node(2, "para", { note: "b" }, [text(3, "y")]), node(4, "image", { src: "b" })]);

    const first = hydrated(client, primitives, server).result;
    expect(first).toMatchObject({ adopted: false, mismatch: { class: "attribute", expected: 'title="b"' } });
    expect(hydrated(client, primitives, server).result).toEqual(first);
  });

  it("after the fallback, the PORT is exactly a drawn one: update keeps the fresh nodes", () => {
    const ssr = expectFreshDraw(sample("Go"), sample("Went"));
    const nodes = domNodes(ssr.container.firstChild!);

    ssr.port.update(sample("Gone"));

    domNodes(ssr.container.firstChild!).forEach((fresh, index) => expect(fresh).toBe(nodes[index]));
    expect(ssr.container.querySelector("button")!.textContent).toBe("Gone");
  });
});

describe("hydrate: refusals", () => {
  it("a tree the PORT can't realize at all: the check's refusal, and the server HTML is untouched", () => {
    const { container } = parse(realizeHtml(sample(), primitives));
    const before = container.innerHTML;
    const port = createWebPort({ container, primitives, report: () => {} });

    expect(codeOf(() => port.hydrate(page([node(2, "para", { note: ["list"] })])))).toBe("unrealizable-value");
    expect(container.innerHTML).toBe(before);
    // Nothing is drawn, so hydrating a realizable tree still can.
    expect(port.hydrate(sample())).toEqual({ adopted: true });
  });

  it("already-drawn: a drawn PORT is never cleared by hydrate", () => {
    const { container, port } = drawn(sample(), primitives);
    const before = domNodes(container.firstChild!);

    expect(codeOf(() => port.hydrate(sample()))).toBe("already-drawn");
    expect(domNodes(container.firstChild!)).toEqual(before);
  });
});

describe("hydrate: property slots", () => {
  const withField = (value?: string) => page([node(2, "field", value === undefined ? {} : { value })]);
  const withMeter = (amount?: number) => page([node(2, "meter", amount === undefined ? {} : { amount })]);

  it("an absent property isn't written: input made before hydration is kept", () => {
    const { container } = parse(realizeHtml(withField(), primitives));
    const input = container.querySelector("input")!;
    input.value = "typed";

    const port = createWebPort({ container, primitives, report: () => {} });
    expect(port.hydrate(withField())).toEqual({ adopted: true });
    expect(input.value).toBe("typed");
  });

  it("a present property in the client's tree is applied at adoption, over input made before hydration", () => {
    const { container } = parse(realizeHtml(withField(), primitives));
    const input = container.querySelector("input")!;
    input.value = "typed";

    createWebPort({ container, primitives, report: () => {} }).hydrate(withField("client"));

    expect(input.value).toBe("client");
  });

  it("present → absent restores a fresh element's initial value, never the adopted element's state", () => {
    const withLevel = (amount?: number) => page([node(2, "level", amount === undefined ? {} : { amount })]);
    const { container } = parse(realizeHtml(withLevel(), primitives));
    const element = container.querySelector("valance-level")! as Element & { level?: number };
    element.level = 0.7;
    const port = createWebPort({ container, primitives, report: () => {} });

    expect(port.hydrate(withLevel())).toEqual({ adopted: true });
    expect(element.level).toBe(0.7);
    port.update(withLevel(0.25));
    expect(element.level).toBe(0.25);
    port.update(withLevel());
    // A fresh element's: undefined. Not 0.7, which the adopted element held.
    expect(element.level).toBeUndefined();
    expect(container.querySelector("valance-level")).toBe(element);
  });

  // A DOM property is not represented by an HTML attribute merely because the
  // browser reflects it into one. Hydration doesn't special-case reflection:
  // the reflected attribute is an attribute no realization writes.
  it("a property the platform reflects, changed before hydration, is an attribute mismatch: a fresh draw", () => {
    const { container } = parse(realizeHtml(withMeter(), primitives));
    const server = container.querySelector("progress")! as HTMLProgressElement;
    expect(server.hasAttribute("value")).toBe(false);

    // Property write → the browser reflects it → an HTML attribute exists.
    server.value = 0.7;
    expect(server.getAttribute("value")).toBe("0.7");

    // Hydration sees an unexpected attribute → mismatch → fresh draw.
    const result = createWebPort({ container, primitives, report: () => {} }).hydrate(withMeter());

    expect(result).toMatchObject({ adopted: false, mismatch: { class: "attribute", expected: "no value", found: 'value="0.7"' } });
    expect(container.contains(server)).toBe(false);
    expect((container.querySelector("progress")! as HTMLProgressElement).value).toBe(0);
    expect(container.querySelector("progress")!.hasAttribute("value")).toBe(false);
  });

  it("the same for a text property", () => {
    const { container } = parse(realizeHtml(withField(), primitives));
    const input = container.querySelector("input")!;
    input.value = "typed";
    const port = createWebPort({ container, primitives, report: () => {} });

    port.hydrate(withField());
    port.update(withField("x"));
    port.update(withField());

    expect(input.value).toBe("");
  });
});

describe("hydrate: events", () => {
  const nested = page([node(2, "card", {}, [node(3, "button", {}, [text(4, "Go")], { click: handler(3) }), node(5, "para", {}, [text(6, "text")])], { click: handler(2) })]);
  const click = (window: { readonly Event: typeof Event }, target: Node) => target.dispatchEvent(new window.Event("click", { bubbles: false }));

  it("before hydration: no PORT interaction; after it: MESH's resolution, one report", () => {
    const { window, container } = parse(realizeHtml(nested, primitives));
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives, report });

    click(window, container.querySelector("button")!);
    expect(calls).toEqual([]);

    port.hydrate(nested);
    click(window, container.querySelector("button")!);
    click(window, container.querySelector("p")!.firstChild!);

    expect(calls).toEqual([[handler(3)], [handler(2)]]);
  });

  it("after a mismatch: the fresh draw resolves as a draw does, and the server's nodes report nothing", () => {
    const server = realizeHtml(nested, primitives);
    const { window, container } = parse(server);
    const stale = container.querySelector("button")!;
    const { calls, report } = reports();
    const changed = page([node(2, "card", {}, [node(3, "button", {}, [text(4, "Went")], { click: handler(3) }), node(5, "para", {}, [text(6, "text")])], { click: handler(2) })]);

    expect(createWebPort({ container, primitives, report }).hydrate(changed).adopted).toBe(false);
    click(window, stale);
    click(window, container.querySelector("button")!);

    expect(calls).toEqual([[handler(3)]]);
  });

  it("uses the client tree's handler identifiers: HTML carries none", () => {
    const html = realizeHtml(nested, primitives);

    expect(html).not.toContain(handler(2));
    expect(html).not.toContain(handler(3));

    // The client's tree binds other handlers: same HTML, so adopted, and reports use the client's.
    const rebound = page([node(2, "card", {}, [node(3, "button", {}, [text(4, "Go")], { click: handler(9) }), node(5, "para", {}, [text(6, "text")])], { click: handler(8) })]);
    const ssr = hydrated(rebound, primitives, html);
    click(ssr.window, ssr.container.querySelector("button")!);

    expect(ssr.result).toEqual({ adopted: true });
    expect(ssr.calls).toEqual([[handler(9)]]);
  });

  // MESH v0.6's event vectors, on hydrated DOM: the same resolution as on drawn DOM.
  describe("MESH conformance events, on hydrated DOM", () => {
    const vectors = new URL("../../../fixtures/mesh-conformance/", import.meta.url);
    const events = JSON.parse(readFileSync(new URL("events/expected.tree.json", vectors), "utf8")) as RenderTree;
    const manifest = JSON.parse(readFileSync(new URL("components.json", vectors), "utf8")) as { components: Record<string, { events: Record<string, unknown> }> };
    const cases = JSON.parse(readFileSync(new URL("events/cases.json", vectors), "utf8")) as ReadonlyArray<{ readonly case: string; readonly interaction: { readonly target: string; readonly applicable: Readonly<Record<string, string>> }; readonly expect: { readonly none: true } | { readonly handler: string } }>;
    const elements: Readonly<Record<string, string>> = { card: "section", row: "div", button: "button", label: "span" };
    const partsOf = (part: RenderNode | RenderTree["root"]["children"][number]): ReadonlyArray<{ readonly key: string; readonly text?: string }> =>
      part.type === "text" ? [part] : [part, ...part.children.flatMap(partsOf)];

    for (const vector of cases) {
      it(vector.case, () => {
        const table: WebPrimitives = Object.fromEntries(Object.entries(elements).map(([component, element]) => [component, {
          element,
          events: Object.fromEntries(Object.keys(manifest.components[component]!.events).map((event) =>
            [event, { type: vector.interaction.applicable[component] === event ? "valance-interaction" : `other-${event}` }])),
        }]));
        const ssr = hydrated(events, table);
        expect(ssr.result).toEqual({ adopted: true });

        // Tree parts and DOM nodes in the same order; this tree has no empty text runs.
        const index = partsOf(events.root).findIndex((part) => part.key === vector.interaction.target);
        const target = domNodes(ssr.container.firstChild!)[index]!;
        target.dispatchEvent(new ssr.window.Event("valance-interaction", { bubbles: false }));

        expect(ssr.calls).toEqual("none" in vector.expect ? [] : [[vector.expect.handler]]);
      });
    }
  });
});
