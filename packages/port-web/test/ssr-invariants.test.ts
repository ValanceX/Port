// The SSR design's atomicity and non-assignment invariants
// (docs/superpowers/specs/2026-09-28-port-web-ssr.md §2A, §4.8, §5, §7),
// observed directly: property assignments are counted by a setter probe,
// DOM mutations by a MutationObserver, and refusals by what the API
// returns, rather than inferred from final values.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { attribute, createWebPort, property, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { handler, key, node, text, tree } from "./support.js";
import { allNodes, codeOf, parse, realized } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  para: { element: "p", props: { note: attribute("title") } },
  field: { element: "input", props: { value: textProperty("value"), checked: property("checked", "boolean") } },
  button: { element: "button", events: { click: { type: "click" } } },
};

/**
 * Counts every assignment to `element[name]`, and forwards it (and reads)
 * to the platform's own accessor, so the element behaves as before.
 */
const assignments = (element: Element, name: string): { readonly count: () => number } => {
  let platform: PropertyDescriptor | undefined;

  for (let proto = Object.getPrototypeOf(element); platform === undefined && proto !== null; proto = Object.getPrototypeOf(proto)) {
    platform = Object.getOwnPropertyDescriptor(proto, name);
  }

  let count = 0;
  Object.defineProperty(element, name, {
    configurable: true,
    get() {
      return platform!.get!.call(element);
    },
    set(value: unknown) {
      count += 1;
      platform!.set!.call(element, value);
    },
  });

  return { count: () => count };
};

describe("an absent property is not written during hydration", () => {
  const withField = (props: Readonly<Record<string, string | boolean>>): RenderTree => tree(node(1, "page", { title: "T" }, [node(2, "field", props)]));

  it("no assignment at all: the user's value and checked state are left exactly as the browser holds them", () => {
    const { container } = parse(realizeHtml(withField({}), primitives));
    const input = container.querySelector("input")!;
    // Property state established before hydration: typing, and a checked box.
    input.value = "typed";
    input.checked = true;
    const value = assignments(input, "value");
    const checked = assignments(input, "checked");

    expect(createWebPort({ container, primitives, report: () => {} }).hydrate(withField({}))).toEqual({ adopted: true });

    expect({ value: value.count(), checked: checked.count() }).toEqual({ value: 0, checked: 0 });
    expect({ value: input.value, checked: input.checked }).toEqual({ value: "typed", checked: true });
  });

  it("the probe sees assignments: a present property is assigned exactly once, and overwrites pre-hydration input (out of scope to preserve)", () => {
    const { container } = parse(realizeHtml(withField({}), primitives));
    const input = container.querySelector("input")!;
    input.value = "typed";
    const value = assignments(input, "value");
    const checked = assignments(input, "checked");

    createWebPort({ container, primitives, report: () => {} }).hydrate(withField({ value: "client" }));

    expect({ value: value.count(), checked: checked.count() }).toEqual({ value: 1, checked: 0 });
    expect(input.value).toBe("client");
  });
});

describe("hydration is atomic: verification mutates nothing", () => {
  // Two valid subtrees first, each with something adoption would change (an
  // empty text run to insert, a present property to assign), and the
  // mismatch last, in document order.
  const client = tree(node(1, "page", { title: "T" }, [
    node(2, "para", { note: "first" }, [node(3, "text", {}, [text(4, "")])]),
    node(5, "field", { value: "client" }),
    node(6, "text", {}, [text(7, "late")]),
  ]));
  const server = tree(node(1, "page", { title: "T" }, [
    node(2, "para", { note: "first" }, [node(3, "text", {}, [text(4, "")])]),
    node(5, "field", {}),
    node(6, "text", {}, [text(7, "stale")]),
  ]));

  it("a late mismatch: zero mutations of the server DOM, then a complete fresh draw", () => {
    const { window, container } = parse(realizeHtml(server, primitives));
    const root = container.firstChild!;
    const before = realized(container, ["value"]);
    const serverNodes = allNodes(container);
    const input = container.querySelector("input")!;
    const value = assignments(input, "value");
    const observer = new window.MutationObserver(() => {});
    observer.observe(window.document, { subtree: true, childList: true, attributes: true, characterData: true });

    const result = createWebPort({ container, primitives, report: () => {} }).hydrate(client);
    const records = observer.takeRecords();

    expect(result).toMatchObject({ adopted: false, mismatch: { class: "text", key: key(7) } });
    // The only mutation is the fresh draw replacing the container's content.
    expect(records.map((record) => ({ type: record.type, target: record.target === container, removed: Array.from(record.removedNodes) })))
      .toEqual([{ type: "childList", target: true, removed: [root] }]);
    // Nothing in the server subtree was touched: no insertion, attribute, text or property write.
    expect(value.count()).toBe(0);
    const detached = window.document.createElement("main");
    detached.append(root);
    expect(realized(detached, ["value"])).toEqual(before);
    // No server node survives in the container.
    expect(allNodes(container).filter((node) => serverNodes.includes(node))).toEqual([]);
  });

  it("the same tree with no mismatch: adoption is the only phase that changes anything", () => {
    const { window, container } = parse(realizeHtml(tree(node(1, "page", { title: "T" }, [
      node(2, "para", { note: "first" }, [node(3, "text", {}, [text(4, "")])]),
      node(5, "field", {}),
      node(6, "text", {}, [text(7, "late")]),
    ])), primitives));
    const input = container.querySelector("input")!;
    const value = assignments(input, "value");
    const observer = new window.MutationObserver(() => {});
    observer.observe(window.document, { subtree: true, childList: true, attributes: true, characterData: true });

    expect(createWebPort({ container, primitives, report: () => {} }).hydrate(client)).toEqual({ adopted: true });

    // Adoption: the empty text node inserted, the present property assigned. Nothing else.
    expect(observer.takeRecords().map((record) => ({ type: record.type, added: Array.from(record.addedNodes, (added) => added.nodeType) })))
      .toEqual([{ type: "childList", added: [3] }]);
    expect(value.count()).toBe(1);
  });
});

describe("server refusal is atomic: complete HTML, or a refusal and nothing", () => {
  const valid = (n: number) => node(n, "para", { note: `note ${n}` }, [node(n + 1000, "text", {}, [text(n + 2000, `text ${n}`)])]);
  const many = Array.from({ length: 20 }, (_, index) => valid(index + 10));

  for (const [what, last, code] of [
    ["U+0000 in the last text run", node(99, "text", {}, [text(98, "late\u0000")]), "unserializable-text"],
    ["a present property in the last node", node(99, "field", { value: "late" }), "unserializable-prop"],
    ["a list in the last node's text attribute", node(99, "para", { note: ["late"] }), "unrealizable-value"],
  ] as const) {
    it(`${what}: throws ${code}, and returns no HTML at all`, () => {
      const late = tree(node(1, "page", { title: "T" }, [...many, last]));
      let returned: string | undefined;

      expect(codeOf(() => { returned = realizeHtml(late, primitives); })).toBe(code);
      expect(returned).toBeUndefined();
    });
  }

  it("keeps no state between calls: after a refusal, a valid tree gives its complete HTML", () => {
    const whole = tree(node(1, "page", { title: "T" }, many));
    const expected = realizeHtml(whole, primitives);

    expect(codeOf(() => realizeHtml(tree(node(1, "page", { title: "T" }, [...many, node(99, "field", { value: "x" })])), primitives))).toBe("unserializable-prop");
    expect(realizeHtml(whole, primitives)).toBe(expected);
    expect(expected.endsWith("</section>")).toBe(true);
    expect(expected.match(/<p /g)).toHaveLength(20);
  });
});

describe("server HTML carries no keys, handler identifiers or program identity", () => {
  it("none of the tree's opaque identifiers appear in the HTML", () => {
    const keyed = tree(node(1, "page", { title: "T" }, [node(2, "button", {}, [text(3, "Go")], { click: handler(7) }), node(4, "para", { note: "n" })]));
    const html = realizeHtml(keyed, primitives);

    for (const identifier of [key(1), key(2), key(3), key(4), handler(7), handler(7).split(".")[0]!]) {
      expect(html).not.toContain(identifier);
    }

    expect(html).toBe('<section aria-label="T"><button>Go</button><p title="n"></p></section>');
  });
});
