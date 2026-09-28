// Server HTML realization (docs/superpowers/specs/2026-09-28-port-web-ssr.md
// §4, §12). The criterion is semantic parity: server HTML, parsed as a page
// load parses it and hydrated, realizes exactly what a fresh client draw
// does. HTML strings are compared only where determinism is under test.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort, property, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, handler, node, readJson, slicePrimitives, sliceProgram, text, tree, treeOf } from "./support.js";
import { SERVER_ONLY, codeOf, expectParity, hydrated, parse, realized } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  para: { element: "p", props: { note: attribute("title"), hidden: booleanAttribute("hidden"), level: attribute("data-level") } },
  code: { element: "pre" },
  image: { element: "img", props: { src: attribute("src") } },
  meter: { element: "progress", props: { amount: property("value", "number") } },
  field: { element: "input", props: { value: textProperty("value"), label: attribute("aria-label") } },
  button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
  script: { element: "script" },
  editor: { element: "textarea" },
  drawing: { element: "svg" },
  fragment: { element: "template" },
};

/** A node as MESH gives it, with `propText` only when some prop has an entry. */
const withText = (base: RenderNode, propText: Readonly<Record<string, string>>): RenderNode => ({ ...base, propText });

const TRICKY = "a & b < c > d \" ' \r x \r\n y \u0085   😀 &amp; &#13; </main><script>";

describe("serialization: parity with a fresh client draw", () => {
  it("MESH's slice, as the slice's application realizes it", async () => {
    const slice = await sliceProgram();

    expectParity(await treeOf(slice, readJson("snapshots/first.json")), slicePrimitives);
    expectParity(await treeOf(slice, readJson("snapshots/second.json")), slicePrimitives);
  });

  it("a string attribute, whatever characters it holds", () => {
    const ssr = expectParity(tree(node(1, "para", { note: TRICKY })), primitives);

    expect(ssr.container.firstElementChild!.getAttribute("title")).toBe(TRICKY);
  });

  it("canonical propText: the attribute is MESH's text, copied, never formatted", () => {
    const cases: ReadonlyArray<readonly [number | boolean | null, string]> = [
      [42, "forty-two"], [1e21, "1e+21"], [5e-324, "5e-324"], [0.30000000000000004, "0.30000000000000004"], [true, "true"], [false, "false"], [null, "null"],
    ];

    for (const [value, propText] of cases) {
      const ssr = expectParity(tree(withText(node(1, "para", { level: value }), { level: propText })), primitives);

      expect(ssr.container.firstElementChild!.getAttribute("data-level")).toBe(propText);
    }
  });

  it("a boolean attribute: present, with value \"\", for true; omitted for false and absent", () => {
    expect(expectParity(tree(node(1, "para", { hidden: true })), primitives).container.firstElementChild!.getAttribute("hidden")).toBe("");
    expect(expectParity(tree(node(1, "para", { hidden: false })), primitives).container.firstElementChild!.hasAttribute("hidden")).toBe(false);
    expect(expectParity(tree(node(1, "para", {})), primitives).container.firstElementChild!.hasAttribute("hidden")).toBe(false);
  });

  it("escaped text: markup, references, CR, CRLF and C1 characters come back exactly", () => {
    const ssr = expectParity(tree(node(1, "para", {}, [text(2, TRICKY)])), primitives);

    expect(ssr.container.textContent).toBe(TRICKY);
  });

  it("a leading line feed under pre survives the parser's dropping one", () => {
    for (const body of ["\nline", "\n\nx", "x\n"]) {
      expect(expectParity(tree(node(1, "code", {}, [text(2, body)])), primitives).container.textContent).toBe(body);
    }
  });

  it("nested children, in tree order", () => {
    expectParity(tree(node(1, "page", { title: "T" }, [
      text(2, "before"),
      node(3, "para", { note: "n" }, [node(4, "text", {}, [text(5, "deep")]), text(6, " & after")]),
      node(7, "image", { src: "a.png" }),
      node(8, "button", { disabled: true }, [text(9, "Go")], { click: handler(1) }),
      text(10, "end"),
    ])), primitives);
  });

  it("an empty text run has no HTML, and hydration puts its empty text node back in its place", () => {
    const empty = tree(node(1, "page", { title: "T" }, [text(2, ""), node(3, "text", {}, [text(4, "")]), text(5, ""), node(6, "image", { src: "a" }), text(7, "")]));

    expect(realizeHtml(empty, primitives)).toBe('<section aria-label="T"><span></span><img src="a"></section>');
    const ssr = expectParity(empty, primitives);
    expect(realized(ssr.container)[0]).toMatchObject({ children: [{ text: "" }, { element: "span", children: [{ text: "" }] }, { text: "" }, { element: "img" }, { text: "" }] });
  });

  it("an unknown component: the visible placeholder, with its children", () => {
    expectParity(tree(node(1, "page", { title: "T" }, [node(2, "user-card", { user: { id: "u" } }, [text(3, "inside \" & <")], { click: handler(1) })])), primitives);
  });

  it("an absent value in a property slot: omission on both sides", () => {
    expectParity(tree(node(1, "page", { title: "T" }, [node(2, "meter", {}), node(3, "field", { label: "L" })])), primitives);
  });
});

describe("serialization: refusals, with no output", () => {
  const both: ReadonlyArray<readonly [string, RenderTree, string]> = [
    ["a list in a text attribute", tree(node(1, "para", { note: ["a"] })), "unrealizable-value"],
    ["a record in a text attribute", tree(node(1, "para", { note: { a: "b" } })), "unrealizable-value"],
    ["a scalar with no propText", tree(node(1, "para", { level: 3 })), "missing-prop-text"],
    ["a string in a boolean attribute", tree(node(1, "para", { hidden: "yes" })), "unrealizable-value"],
    ["a prop with no realization", tree(node(1, "para", { colour: "red" })), "unrealized-prop"],
    ["an event with no realization", tree(node(1, "para", {}, [], { click: handler(1) })), "unrealized-event"],
    ["children under a void element", tree(node(1, "image", { src: "a" }, [text(2, "")])), "unrealizable-children"],
    ["two parts with one key", tree(node(1, "page", { title: "T" }, [text(1, "x")])), "duplicate-key"],
    ["two adjacent text runs", tree(node(1, "page", { title: "T" }, [text(2, "a"), text(3, "b")])), "unsupported-tree"],
    ["another format", { ...tree(node(1, "text")), format: "other" } as unknown as RenderTree, "unsupported-tree"],
  ];

  for (const [what, bad, code] of both) {
    it(`${what}: ${code}, on the server and the client alike`, () => {
      expect(codeOf(() => realizeHtml(bad, primitives))).toBe(code);
      expect(codeOf(() => createWebPort({ container: dom().container, primitives, report: () => {} }).draw(bad))).toBe(code);
    });
  }

  const serverOnly: ReadonlyArray<readonly [string, RenderTree, string]> = [
    ["a present number property", tree(node(1, "meter", { amount: 0.5 })), "unserializable-prop"],
    ["a present text property", tree(node(1, "field", { value: "typed" })), "unserializable-prop"],
    ["U+0000 in a text run", tree(node(1, "para", {}, [text(2, "a\u0000b")])), "unserializable-text"],
    ["U+0000 in an attribute", tree(node(1, "para", { note: "a\u0000b" })), "unserializable-text"],
    ["a script element", tree(node(1, "script", {}, [text(2, "x")])), "unserializable-element"],
    ["a textarea element", tree(node(1, "editor", {}, [text(2, "x")])), "unserializable-element"],
    ["an svg element", tree(node(1, "drawing")), "unserializable-element"],
    ["a template element", tree(node(1, "fragment")), "unserializable-element"],
  ];

  for (const [what, bad, code] of serverOnly) {
    it(`${what}: ${code}, on the server only`, () => {
      expect(SERVER_ONLY).toContain(code);
      expect(codeOf(() => realizeHtml(bad, primitives))).toBe(code);
      expect(codeOf(() => createWebPort({ container: dom().container, primitives, report: () => {} }).draw(bad))).toBe("realized");
    });
  }

  it("refuses deep in a tree, too, with no partial output", () => {
    const deep = tree(node(1, "page", { title: "T" }, [node(2, "para", { note: "ok" }, [text(3, "fine")]), node(4, "meter", { amount: 1 })]));
    let output: string | undefined;

    expect(codeOf(() => { output = realizeHtml(deep, primitives); })).toBe("unserializable-prop");
    expect(output).toBeUndefined();
  });
});

describe("serialization: determinism", () => {
  const sample = tree(node(1, "page", { title: "T & t" }, [node(2, "para", { note: "n", hidden: true, level: 2 }, [text(3, "a\rb")])]));
  const withLevel = { ...sample, root: { ...sample.root, children: [withText(sample.root.children[0] as RenderNode, { level: "2" })] } } as RenderTree;

  it("gives exactly one HTML for a tree: attributes in name order, whatever the table's or the tree's order", () => {
    const reordered: WebPrimitives = {
      para: { element: "p", props: { level: attribute("data-level"), hidden: booleanAttribute("hidden"), note: attribute("title") } },
      page: primitives["page"]!,
    };
    const expected = '<section aria-label="T &amp; t"><p data-level="2" hidden title="n">a&#13;b</p></section>';

    expect(realizeHtml(withLevel, primitives)).toBe(expected);
    expect(realizeHtml(withLevel, reordered)).toBe(expected);
    expect(realizeHtml(withLevel, primitives)).toBe(realizeHtml(withLevel, primitives));
  });

  it("escapes only &, <, >, \" in attributes, and CR, as the design says: C1 and every other character stay literal", () => {
    expect(realizeHtml(tree(node(1, "para", { note: "\"&<>\r\u0085 '" }, [text(2, "\"&<>\r\u0085 '")])), primitives))
      .toBe('<p title="&quot;&amp;&lt;&gt;&#13;\u0085 \'">"&amp;&lt;&gt;&#13;\u0085 \'</p>');
  });
});

// MESH v0.6's value vectors through the server: each case's node, reduced
// to the case's prop, realized in a text attribute, gives the same result
// by SSR + hydrate as by a client draw, or the same refusal on both sides.
describe("serialization: MESH conformance values", () => {
  const vectors = new URL("../../../fixtures/mesh-conformance/values/", import.meta.url);
  const values = JSON.parse(readFileSync(new URL("expected.tree.json", vectors), "utf8")) as RenderTree;
  const cases = JSON.parse(readFileSync(new URL("cases.json", vectors), "utf8")) as ReadonlyArray<{ readonly case: string; readonly node?: string; readonly prop?: string; readonly textRun?: string; readonly states?: ReadonlyArray<{ readonly node: string }> }>;
  const nodes = (part: RenderNode): ReadonlyArray<RenderNode> => [part, ...part.children.flatMap((child) => child.type === "node" ? nodes(child) : [])];
  const byKey = (key: string) => nodes(values.root).find((candidate) => candidate.key === key)!;

  /** The node, with only `prop` (and its propText, when it has one). */
  const reduced = (key: string, prop: string): RenderTree => {
    const original = byKey(key);
    const props = Object.hasOwn(original.props, prop) ? { [prop]: original.props[prop]! } : {};
    const entry = original.propText?.[prop];

    return tree({ ...original, props, ...(entry === undefined ? {} : { propText: { [prop]: entry } }), children: [] } as RenderNode);
  };

  const table = (component: string, prop: string): WebPrimitives => ({ [component]: { element: "div", props: { [prop]: attribute(`data-${prop}`) } } });

  for (const vector of cases.filter((c) => c.prop !== undefined)) {
    it(vector.case, () => {
      const single = reduced(vector.node!, vector.prop!);
      const primitives = table(single.root.component, vector.prop!);
      const client = codeOf(() => createWebPort({ container: dom().container, primitives, report: () => {} }).draw(single));

      if (client === "realized") {
        expectParity(single, primitives);
      } else {
        expect(codeOf(() => realizeHtml(single, primitives))).toBe(client);
      }
    });
  }

  it("content uses the same text: the text run, by SSR", () => {
    const run = cases.find((c) => c.textRun !== undefined)!;
    const holder = nodes(values.root).find((candidate) => candidate.children.some((child) => child.key === run.textRun))!;

    expectParity(tree(holder), { [holder.component]: { element: "span" } });
  });

  it("absent, null and string: three distinct states, by SSR as by the client", () => {
    const states = cases.find((c) => c.states !== undefined)!.states!;
    const html = states.map(({ node: key }) => {
      const single = reduced(key, "value");
      expectParity(single, table("cell", "value"));

      return parse(realizeHtml(single, table("cell", "value"))).container.innerHTML;
    });

    expect(html).toEqual(["<div></div>", '<div data-value="null"></div>', '<div data-value="hello"></div>']);
  });
});

describe("serialization: the page parse is the real one", () => {
  it("a fragment parse and a document parse of server HTML agree, for the cases above", () => {
    const html = realizeHtml(tree(node(1, "code", {}, [text(2, "\nx\r")])), primitives);
    const { container } = dom();
    container.innerHTML = html;

    expect(realized(container)).toEqual(realized(parse(html).container));
    expect(hydrated(tree(node(1, "code", {}, [text(2, "\nx\r")])), primitives).result).toEqual({ adopted: true });
  });
});
