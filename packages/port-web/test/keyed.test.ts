// The keyed reconciliation tracer: does `update` realize MESH's semantic
// identity (an opaque render-v1 key) as the target object's identity?
//
// Hand-written render-v1 trees only: PORT knows no MPRX, no repeat, no
// application data. A key is an opaque string, and the one thing these tests
// observe is which DOM object realizes it. Final DOM equality proves nothing
// here ("C A B" is also what a positional patch produces), so every case
// asserts the *objects*: the element drawn for a key before an update is the
// element that realizes it after, or is disposed, or was never there.
import type { RenderNode, RenderTree, TextRun } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { WebRealizationError, createWebPort } from "../src/index.js";

import { dom, handler, node, reports, slicePrimitives, text, tree } from "./support.js";

/** Keys 1 (the root) and 100+ (each item) are fixed by the helpers below. */
const ITEM: Readonly<Record<string, number>> = { A: 11, B: 12, C: 13, X: 14, Y: 15, Z: 16 };

const item = (label: string, children: ReadonlyArray<RenderNode | TextRun> = []): RenderNode =>
  node(ITEM[label]!, "button", {}, [text(ITEM[label]! + 100, label), ...children], { click: handler(ITEM[label]!) });

const list = (...labels: ReadonlyArray<string>): RenderTree => tree(node(1, "page", { title: "T" }, labels.map((label) => item(label))));

const setup = () => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives: slicePrimitives, report });

  /** The element realizing each item now, by label, in DOM order. */
  const realized = (): ReadonlyMap<string, Element> =>
    new Map(Array.from(container.querySelectorAll("button")).map((button) => [button.firstChild!.textContent!, button]));
  const order = (): string[] => Array.from(realized().keys());
  const click = (target: Element) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

  return { container, port, realized, order, click, calls };
};

describe("keyed reconciliation: one program, a changing structure", () => {
  it("P1: a stable tree keeps every realization", () => {
    const { port, realized } = setup();
    port.draw(list("A", "B", "C"));
    const before = realized();
    port.update(list("A", "B", "C"));

    for (const label of ["A", "B", "C"]) {
      expect(realized().get(label)).toBe(before.get(label));
    }
  });

  it("P2: an insertion keeps its neighbours and creates only the new key", () => {
    const { port, realized, order } = setup();
    port.draw(list("A", "B"));
    const before = realized();
    port.update(list("A", "X", "B"));
    const after = realized();

    expect(order()).toEqual(["A", "X", "B"]);
    expect(after.get("A")).toBe(before.get("A"));
    expect(after.get("B")).toBe(before.get("B"));
    expect(after.get("X")).not.toBe(before.get("A"));
    expect(after.get("X")).not.toBe(before.get("B"));
  });

  it("P3: removing the middle disposes it, and the next key does not inherit its object", () => {
    const { port, realized, order } = setup();
    port.draw(list("A", "B", "C"));
    const before = realized();
    port.update(list("A", "C"));
    const after = realized();

    expect(order()).toEqual(["A", "C"]);
    expect(after.get("A")).toBe(before.get("A"));
    expect(after.get("C")).toBe(before.get("C"));
    expect(after.get("C")).not.toBe(before.get("B"));
    expect(before.get("B")!.isConnected).toBe(false);
  });

  it("P4: removing the first disposes it and keeps the rest", () => {
    const { port, realized, order } = setup();
    port.draw(list("A", "B", "C"));
    const before = realized();
    port.update(list("B", "C"));
    const after = realized();

    expect(order()).toEqual(["B", "C"]);
    expect(after.get("B")).toBe(before.get("B"));
    expect(after.get("C")).toBe(before.get("C"));
    expect(before.get("A")!.isConnected).toBe(false);
  });

  it("P5: a reorder moves the existing realizations and recreates none", () => {
    const { port, realized, order } = setup();
    port.draw(list("A", "B", "C"));
    const before = realized();
    port.update(list("C", "A", "B"));
    const after = realized();

    expect(order()).toEqual(["C", "A", "B"]);
    for (const label of ["A", "B", "C"]) {
      expect(after.get(label)).toBe(before.get(label));
    }
  });

  it("P6: a replacement disposes the old key and creates the new one, though position and component match", () => {
    const { port, realized } = setup();
    port.draw(list("A"));
    const before = realized();
    port.update(list("X"));

    expect(realized().get("X")).not.toBe(before.get("A"));
    expect(before.get("A")!.isConnected).toBe(false);
    expect(realized().size).toBe(1);
  });

  it("P7: a key that leaves and returns is a new realization, not the old one", () => {
    const { port, realized } = setup();
    port.draw(list("A"));
    const first = realized().get("A")!;
    port.update(list());
    expect(first.isConnected).toBe(false);
    port.update(list("A"));
    const second = realized().get("A")!;

    expect(second).not.toBe(first);
    expect(second.isConnected).toBe(true);
    expect(first.isConnected).toBe(false);
  });

  it("an update from one program is an update, however much the structure changed", () => {
    const { port, container, realized, order } = setup();
    port.draw(list("A", "B", "C"));
    const page = container.firstChild;
    const before = realized();
    port.update(list("C", "A", "X"));

    expect(container.firstChild).toBe(page);
    expect(order()).toEqual(["C", "A", "X"]);
    expect(realized().get("C")).toBe(before.get("C"));
    expect(realized().get("A")).toBe(before.get("A"));
    expect(before.get("B")!.isConnected).toBe(false);
  });

  it("is recursive: children are matched by their own keys within a kept parent", () => {
    const { port, container } = setup();
    const withChildren = (...inner: ReadonlyArray<string>) => tree(node(1, "page", {}, [item("A", inner.map((label) => item(label)))]));
    const parts = () => {
      const a = container.querySelector("section > button")!;
      const nested = new Map(Array.from(a.querySelectorAll(":scope > button")).map((button) => [button.firstChild!.textContent!, button]));

      return { a, nested };
    };

    port.draw(withChildren("X", "Y"));
    const before = parts();
    port.update(withChildren("Y", "X"));
    const after = parts();

    expect(after.a).toBe(before.a);
    expect(Array.from(after.nested.keys())).toEqual(["Y", "X"]);
    expect(after.nested.get("X")).toBe(before.nested.get("X"));
    expect(after.nested.get("Y")).toBe(before.nested.get("Y"));
  });

  it("keeps a text run's node with its key too", () => {
    const { port, container } = setup();
    // Adjacent text runs aren't a render-v1 tree, so interleave nodes.
    const mixed = (...parts: ReadonlyArray<RenderNode | TextRun>) => tree(node(1, "page", {}, parts));
    port.draw(mixed(text(2, "a"), node(3, "text", {}, [text(4, "x")]), text(5, "b")));
    const before = new Map(Array.from(container.querySelector("section")!.childNodes).map((n) => [n.textContent!, n]));
    port.update(mixed(text(5, "b"), node(3, "text", {}, [text(4, "x")]), text(2, "a")));
    const after = new Map(Array.from(container.querySelector("section")!.childNodes).map((n) => [n.textContent!, n]));

    expect(after.get("a")).toBe(before.get("a"));
    expect(after.get("b")).toBe(before.get("b"));
    expect(after.get("x")).toBe(before.get("x"));
    expect(Array.from(container.querySelector("section")!.childNodes).map((n) => n.textContent)).toEqual(["b", "x", "a"]);
  });
});

describe("keyed reconciliation: handlers follow the key", () => {
  it("after a reorder each realization still reports its own handler", () => {
    const { port, realized, click, calls } = setup();
    port.draw(list("A", "B"));
    const before = realized();
    port.update(list("B", "A"));

    click(before.get("A")!);
    click(before.get("B")!);
    expect(calls).toEqual([[handler(ITEM.A!)], [handler(ITEM.B!)]]);

    // The first button now is B, by object and by what it reports.
    calls.length = 0;
    click(Array.from(realized().values())[0]!);
    expect(calls).toEqual([[handler(ITEM.B!)]]);
  });

  it("after an insertion and a removal, interactions reach only live keys, each with its own handler", () => {
    const { port, realized, click, calls } = setup();
    port.draw(list("A", "B", "C"));
    const before = realized();
    port.update(list("A", "X", "C"));

    click(before.get("B")!);
    expect(calls).toEqual([]);
    click(realized().get("X")!);
    click(realized().get("C")!);
    expect(calls).toEqual([[handler(ITEM.X!)], [handler(ITEM.C!)]]);
  });

  it("a handler identifier that changes for a kept key is the one reported next", () => {
    const { port, realized, click, calls } = setup();
    port.draw(list("A"));
    const before = realized().get("A")!;
    port.update(tree(node(1, "page", { title: "T" }, [node(ITEM.A!, "button", {}, [text(ITEM.A! + 100, "A")], { click: handler(99) })])));

    expect(realized().get("A")).toBe(before);
    click(before);
    expect(calls).toEqual([[handler(99)]]);
  });
});

describe("keyed reconciliation: the boundary", () => {
  it("refuses a duplicate key before touching anything drawn", () => {
    const { port, container, realized } = setup();
    port.draw(list("A", "B"));
    const html = container.innerHTML;
    const before = realized();
    const duplicated = tree(node(1, "page", { title: "T" }, [item("A"), item("A")]));

    expect(() => port.update(duplicated)).toThrow(expect.objectContaining({ code: "duplicate-key" }));
    expect(() => port.update(duplicated)).toThrow(WebRealizationError);
    expect(container.innerHTML).toBe(html);
    expect(realized().get("A")).toBe(before.get("A"));
    expect(realized().get("B")).toBe(before.get("B"));
  });

  it("refuses a duplicate across levels as well, and in a first draw", () => {
    const { port, container } = setup();
    const nested = tree(node(1, "page", {}, [item("A", [item("A")])]));

    expect(() => port.draw(nested)).toThrow(expect.objectContaining({ code: "duplicate-key" }));
    expect(container.childNodes).toHaveLength(0);
  });

  it("does not keep a realization across a change of component: the key matches, the object is replaced", () => {
    // Realization compatibility (docs/CONTRACT.md): a realization is retained
    // only when the key and the component are compatible. PORT's own safety
    // rule for malformed input, not a MESH identity rule.
    const { port, container } = setup();
    const as = (component: string) => tree(node(1, "page", {}, [node(2, component, {}, [text(3, "same")])]));

    port.draw(as("text"));
    const span = container.querySelector("span")!;
    port.update(as("button"));

    expect(container.querySelector("button")).not.toBeNull();
    expect(span.isConnected).toBe(false);
  });
});
