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

// A DOM property setter is external behavior: PORT can't roll back what it,
// or adoption before it, did. So a setter that throws during adoption is
// reported as adoption-failed, a realization failure: not a mismatch, not
// { adopted: true }, and never retried or turned into a fresh draw.
describe("a property setter that throws during adoption", () => {
  const table: WebPrimitives = {
    ...primitives,
    gauge: { element: "valance-gauge", props: { level: property("level", "value") } },
  };
  // In document order: an empty text run (adoption inserts it), the failing
  // gauge, then a field whose present value adoption would assign next.
  const client = tree(node(1, "page", { title: "T" }, [
    node(2, "para", { note: "first" }, [node(3, "text", {}, [text(4, "")])]),
    node(5, "gauge", { level: 1 }),
    node(6, "button", {}, [text(7, "Go")], { click: handler(1) }),
    node(8, "field", { value: "client" }),
  ]));
  const server = tree(node(1, "page", { title: "T" }, [
    node(2, "para", { note: "first" }, [node(3, "text", {}, [text(4, "")])]),
    node(5, "gauge", {}),
    node(6, "button", {}, [text(7, "Go")], { click: handler(1) }),
    node(8, "field", {}),
  ]));

  const setup = () => {
    const { window, container } = parse(realizeHtml(server, table));
    const serverNodes = allNodes(container);
    const gauge = container.querySelector("valance-gauge")!;
    let reached = 0;
    const failure = new Error("the gauge refuses");
    Object.defineProperty(gauge, "level", { configurable: true, get: () => undefined, set: () => { reached += 1; throw failure; } });
    const value = assignments(container.querySelector("input")!, "value");
    const calls: Array<ReadonlyArray<unknown>> = [];
    const port = createWebPort({ container, primitives: table, report: (...args) => { calls.push(args); } });
    const observer = new window.MutationObserver(() => {});
    observer.observe(window.document, { subtree: true, childList: true, attributes: true, characterData: true });

    return { window, container, serverNodes, failure, reached: () => reached, value, calls, port, observer };
  };

  it("is reported as adoption-failed, after verification succeeded and adoption began, with the setter's error as its cause", () => {
    const { port, failure, reached, observer } = setup();
    let returned: unknown;
    let thrown: unknown;

    try {
      returned = port.hydrate(client);
    } catch (error) {
      thrown = error;
    }

    // Not { adopted: true }, and not a mismatch: hydrate returned nothing.
    expect(returned).toBeUndefined();
    expect(thrown).toMatchObject({ name: "WebRealizationError", code: "adoption-failed", key: key(5), cause: failure });
    // The setter was reached, exactly once: no second adoption.
    expect(reached()).toBe(1);
    // Adoption had begun, so verification had succeeded: the empty text node
    // before the gauge was inserted. No fresh draw replaced the container.
    expect(observer.takeRecords().map((record) => ({ type: record.type, added: Array.from(record.addedNodes, (added) => added.nodeType), removed: record.removedNodes.length })))
      .toEqual([{ type: "childList", added: [3], removed: 0 }]);
  });

  it("leaves the state as it is, stated explicitly: partly adopted DOM, nothing drawn, no listeners, no rollback", () => {
    const { window, container, serverNodes, value, calls, port } = setup();

    expect(codeOf(() => port.hydrate(client))).toBe("adoption-failed");

    // The DOM: every server node still in place, plus the one inserted empty
    // text node, which is not removed again. Adoption stopped at the gauge,
    // so the field after it was never assigned.
    expect(serverNodes.every((server) => container.contains(server))).toBe(true);
    expect(allNodes(container).filter((node) => !serverNodes.includes(node)).map((node) => [node.nodeType, node.textContent])).toEqual([[3, ""]]);
    expect(value.count()).toBe(0);
    // PORT: nothing drawn, and nothing reported.
    expect(codeOf(() => port.update(client))).toBe("not-drawn");
    container.querySelector("button")!.dispatchEvent(new window.Event("click", { bubbles: true }));
    expect(calls).toEqual([]);
  });

  it("is not a mismatch: a structural or attribute difference is still reported as a mismatch, with no adoption at all", () => {
    const { container, reached } = setup();
    const changed = tree(node(1, "page", { title: "Other" }, (client.root.children as ReadonlyArray<never>)));
    const port = createWebPort({ container, primitives: table, report: () => {} });

    expect(port.hydrate(changed)).toMatchObject({ adopted: false, mismatch: { class: "attribute" } });
    // The mismatch came first, so adoption never began and the setter was never reached;
    // the fresh draw's own gauge is a new element, without the throwing setter.
    expect(reached()).toBe(0);
  });
});
