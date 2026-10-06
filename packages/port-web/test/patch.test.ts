// patch(): MESH's render-patch-v1 applied in place. The law is the one
// MESH states: applying a list gives exactly what `update` of the full new
// tree gives, so each case draws one tree, patches it, and compares the DOM
// and the realized objects with a second PORT that drew the next tree. Hand-
// written trees and lists only: PORT knows no MPRX and doesn't need the MESH
// runtime to have the patch format.
import type { RenderPatches } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { WebRealizationError, attribute, booleanAttribute, createWebPort, property } from "../src/index.js";

import { dom, handler, key, node, reports, slicePrimitives, text, tree } from "./support.js";

const patches = (...list: RenderPatches["patches"][number][]): RenderPatches => ({ format: "mesh-render-patch", version: 1, patches: list });

const view = (title: string, who: string, disabled: boolean) =>
  tree(node(1, "page", { title }, [
    text(2, `hello ${who}`),
    node(3, "button", { disabled }, [text(4, "go")], { click: handler(3) }),
  ]));

const setup = (primitives = slicePrimitives) => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });

  return { window, container, port, calls };
};

describe("patch: the law", () => {
  it("gives the DOM that update of the full next tree gives, and keeps every object", () => {
    const patched = setup();
    const updated = setup();
    patched.port.draw(view("a", "x", false));
    updated.port.draw(view("a", "x", false));
    const before = Array.from(patched.container.querySelectorAll("*"));
    const textBefore = patched.container.querySelector("section")!.firstChild;

    patched.port.patch(patches(
      { op: "setProp", key: key(1), prop: "title", value: "b" },
      { op: "setText", key: key(2), text: "hello y" },
      { op: "setProp", key: key(3), prop: "disabled", value: true },
    ));
    updated.port.update(view("b", "y", true));

    expect(patched.container.innerHTML).toBe(updated.container.innerHTML);
    expect(Array.from(patched.container.querySelectorAll("*"))).toEqual(before);
    expect(patched.container.querySelector("section")!.firstChild).toBe(textBefore);
  });

  it("removes a prop as update does, and a prop with MESH text realizes that text", () => {
    const patched = setup();
    patched.port.draw(view("a", "x", true));
    patched.port.patch(patches({ op: "removeProp", key: key(3), prop: "disabled" }));
    expect(patched.container.querySelector("button")!.hasAttribute("disabled")).toBe(false);

    const sized = setup();
    sized.port.draw(tree({ ...node(1, "avatar", { src: "a.png", alt: "x", size: 1 }), propText: { size: "1" } }));
    sized.port.patch(patches({ op: "setProp", key: key(1), prop: "size", value: 24, propText: "24" }));
    expect(sized.container.querySelector("img")!.getAttribute("data-size")).toBe("24");
  });

  it("an empty list changes nothing, and a replace is a draw", () => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    const html = container.innerHTML;
    const before = container.querySelector("button");
    port.patch(patches());
    expect(container.innerHTML).toBe(html);
    expect(container.querySelector("button")).toBe(before);

    port.patch(patches({ op: "replace", tree: view("z", "q", false) }));
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("z");
    expect(container.querySelector("button")).not.toBe(before);
  });

  it("a patched node still reports through its handler", () => {
    const { window, container, port, calls } = setup();
    port.draw(view("a", "x", false));
    port.patch(patches({ op: "setText", key: key(4), text: "went" }));
    container.querySelector("button")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(calls).toEqual([[handler(3)]]);
  });
});

describe("patch: fine-grained DOM writes", () => {
  it("one changed field mutates exactly one DOM node", () => {
    const { window, container, port } = setup();
    port.draw(view("a", "x", false));
    const records: MutationRecord[] = [];
    const observer = new window.MutationObserver((list) => records.push(...list));
    observer.observe(container, { attributes: true, characterData: true, childList: true, subtree: true });

    port.patch(patches({ op: "setProp", key: key(3), prop: "disabled", value: true }));
    records.push(...observer.takeRecords());
    expect(records.map((record) => [record.type, (record.target as Element).localName])).toEqual([["attributes", "button"]]);

    records.length = 0;
    port.patch(patches({ op: "setText", key: key(2), text: "hello y" }));
    records.push(...observer.takeRecords());
    expect(records.map((record) => [record.type, record.target.nodeType])).toEqual([["characterData", 3]]);

    // A patch that changes nothing the DOM holds writes nothing.
    records.length = 0;
    port.patch(patches({ op: "setProp", key: key(3), prop: "disabled", value: true }, { op: "setText", key: key(2), text: "hello y" }));
    records.push(...observer.takeRecords());
    expect(records).toEqual([]);
  });
});

// Items under a page, as the keyed tests build them: key 10+n for item n, its text 110+n.
const item = (n: number) => node(10 + n, "button", {}, [text(110 + n, `item ${n}`)], { click: handler(10 + n) });
const list = (...ids: number[]) => tree(node(1, "page", { title: "T" }, ids.map(item)));
const labels = (container: Element): string[] => Array.from(container.querySelectorAll("button")).map((button) => button.textContent!);

describe("patch: structure by key", () => {
  const same = (from: number[], to: number[], ops: RenderPatches["patches"]) => {
    const patched = setup();
    const updated = setup();
    patched.port.draw(list(...from));
    updated.port.draw(list(...from));
    updated.port.update(list(...to));
    const before = new Map(Array.from(patched.container.querySelectorAll("button")).map((button) => [button.textContent!, button]));
    patched.port.patch({ format: "mesh-render-patch", version: 1, patches: ops });
    expect(patched.container.innerHTML).toBe(updated.container.innerHTML);

    return { patched, before };
  };

  it("an insert brings its subtree, and keeps the parts around it", () => {
    const { patched, before } = same([1, 3], [1, 2, 3], [{ op: "insert", parent: key(1), before: key(13), node: item(2) }]);
    const now = new Map(Array.from(patched.container.querySelectorAll("button")).map((button) => [button.textContent!, button]));
    expect(now.get("item 1")).toBe(before.get("item 1"));
    expect(now.get("item 3")).toBe(before.get("item 3"));
  });

  it("an insert at the end, and into an empty list", () => {
    same([1, 2], [1, 2, 3], [{ op: "insert", parent: key(1), node: item(3) }]);
    same([], [4], [{ op: "insert", parent: key(1), node: item(4) }]);
  });

  it("a remove disposes the part, and its handler no longer reports", () => {
    const { patched, before } = same([1, 2, 3], [1, 3], [{ op: "remove", key: key(12) }]);
    const gone = before.get("item 2")!;
    expect(gone.isConnected).toBe(false);
    gone.dispatchEvent(new patched.window.MouseEvent("click", { bubbles: true }));
    expect(patched.calls).toEqual([]);
  });

  it("a move keeps the very DOM node, with its text, and moves only it", () => {
    const { patched, before } = same([1, 2, 3, 4, 5], [5, 1, 2, 3, 4], [{ op: "move", key: key(15), before: key(11) }]);
    const now = new Map(Array.from(patched.container.querySelectorAll("button")).map((button) => [button.textContent!, button]));

    for (const [label, button] of before) {
      expect(now.get(label)).toBe(button);
    }
  });

  it("a long list rotated: one move, and every DOM node of the 1,000 items is reused", () => {
    // Keys 10_000 + n for the items and 20_000 + n for their texts, so none of 1,000 collide.
    const big = (n: number) => node(10_000 + n, "button", {}, [text(20_000 + n, `item ${n}`)], { click: handler(10_000 + n) });
    const { container, port } = setup();
    port.draw(tree(node(1, "page", { title: "T" }, Array.from({ length: 1000 }, (_, index) => big(index + 1)))));
    const before = Array.from(container.querySelectorAll("button"));
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "move", key: key(10_000 + 1000), before: key(10_001) }] });
    const after = Array.from(container.querySelectorAll("button"));
    expect(after).toHaveLength(1000);
    expect(new Set(after)).toEqual(new Set(before));
    expect(after[0]).toBe(before[999]);
    expect(after[1]).toBe(before[0]);
  });

  it("returns the keys it touched, in order and without repeats, and inspect finds them", () => {
    const { container, port } = setup();
    port.draw(list(1, 2, 3));
    const touched = port.patch({ format: "mesh-render-patch", version: 1, patches: [
      { op: "setText", key: key(112), text: "x" },
      { op: "move", key: key(13), before: key(11) },
      { op: "insert", parent: key(1), node: item(4) },
      { op: "setText", key: key(112), text: "y" },
      { op: "remove", key: key(11) },
    ] });

    expect(touched).toEqual([key(112), key(13), key(14), key(11)]);
    expect(port.inspect(key(13))).toBe(container.querySelectorAll("button")[0]);
    expect(port.inspect(key(11))).toBeUndefined();
  });

  it("a move to the end", () => {
    same([1, 2, 3], [2, 3, 1], [{ op: "move", key: key(11) }]);
  });

  it("a mix, in order: operations see the ones before them", () => {
    same([1, 2, 3], [9, 3, 1], [
      { op: "remove", key: key(12) },
      { op: "insert", parent: key(1), before: key(11), node: item(9) },
      { op: "move", key: key(13), before: key(11) },
      { op: "setText", key: key(111), text: "item 1" },
    ]);
  });

  it("a removed key that returns is a new part, and an inserted part can be patched in the same list", () => {
    const patched = setup();
    patched.port.draw(list(1, 2));
    const old = patched.container.querySelectorAll("button")[1]!;
    patched.port.patch({ format: "mesh-render-patch", version: 1, patches: [
      { op: "remove", key: key(12) },
      { op: "insert", parent: key(1), node: item(2) },
      { op: "setText", key: key(112), text: "again" },
    ] });
    const now = patched.container.querySelectorAll("button")[1]!;
    expect(now).not.toBe(old);
    expect(now.textContent).toBe("again");
    now.dispatchEvent(new patched.window.MouseEvent("click", { bubbles: true }));
    expect(patched.calls).toEqual([[handler(12)]]);
  });

  it("moving one item changes the DOM only at that item", () => {
    const { window, container, port } = setup();
    port.draw(list(1, 2, 3, 4));
    const moved = container.querySelectorAll("button")[3]!;
    const records: MutationRecord[] = [];
    const observer = new window.MutationObserver((batch) => records.push(...batch));
    observer.observe(container, { attributes: true, characterData: true, childList: true, subtree: true });
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "move", key: key(14), before: key(11) }] });
    records.push(...observer.takeRecords());
    const touched = new Set(records.flatMap((record) => [...record.addedNodes, ...record.removedNodes]));
    expect(touched).toEqual(new Set([moved]));
    expect(labels(container)).toEqual(["item 4", "item 1", "item 2", "item 3"]);
  });

  it("keeps handlers for moved and inserted parts", () => {
    const { window, container, port, calls } = setup();
    port.draw(list(1, 2));
    port.patch({ format: "mesh-render-patch", version: 1, patches: [
      { op: "insert", parent: key(1), node: item(3) },
      { op: "move", key: key(13), before: key(11) },
    ] });
    for (const button of container.querySelectorAll("button")) {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    }
    expect(calls).toEqual([[handler(13)], [handler(11)], [handler(12)]]);
  });
});

describe("patch: refused before the DOM is touched", () => {
  const refused = (list: RenderPatches, code: string) => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    const html = container.innerHTML;

    expect(() => port.patch(list)).toThrowError(expect.objectContaining({ name: "WebRealizationError", code }));
    expect(container.innerHTML).toBe(html);
  };

  it("a key that isn't drawn", () => refused(patches({ op: "setText", key: key(99), text: "x" }), "unknown-key"));
  it("a text op on a node, and a prop op on a text run", () => {
    refused(patches({ op: "setText", key: key(1), text: "x" }), "unsupported-patch");
    refused(patches({ op: "setProp", key: key(2), prop: "title", value: "x" }), "unsupported-patch");
  });
  it("a prop the table doesn't realize", () => refused(patches({ op: "setProp", key: key(1), prop: "nope", value: "x" }), "unrealized-prop"));
  it("a value its slot can't hold, and a number with no propText", () => {
    refused(patches({ op: "setProp", key: key(1), prop: "title", value: [1] }), "unrealizable-value");
    refused(patches({ op: "setProp", key: key(1), prop: "title", value: 5 }), "missing-prop-text");
  });
  it("an operation it doesn't know, never skipped", () => refused({ format: "mesh-render-patch", version: 1, patches: [{ op: "move", key: key(1) } as never] }, "unsupported-patch"));
  it("another format or version", () => {
    refused({ format: "mesh-render", version: 1, patches: [] } as never, "unsupported-patch");
    refused({ format: "mesh-render-patch", version: 2, patches: [] } as never, "unsupported-patch");
  });
  it("a replace among other operations", () =>
    refused(patches({ op: "setText", key: key(2), text: "x" }, { op: "replace", tree: view("a", "x", false) }), "unsupported-patch"));
  it("a list that is bad at its last operation changes nothing of its first", () =>
    refused(patches({ op: "setText", key: key(2), text: "changed" }, { op: "setText", key: key(99), text: "x" }), "unknown-key"));
  it("a replace whose tree can't be realized", () => refused(patches({ op: "replace", tree: tree(node(1, "page", { weird: "x" })) }), "unrealized-prop"));

  const refusedIn = (drawnTree: ReturnType<typeof list>, ops: RenderPatches["patches"], code: string) => {
    const { container, port } = setup();
    port.draw(drawnTree);
    const html = container.innerHTML;
    const before = Array.from(container.querySelectorAll("*"));

    expect(() => port.patch({ format: "mesh-render-patch", version: 1, patches: ops })).toThrowError(expect.objectContaining({ name: "WebRealizationError", code }));
    expect(container.innerHTML).toBe(html);
    expect(Array.from(container.querySelectorAll("*"))).toEqual(before);
  };

  it("structure: an insert before a part that isn't a child, under a text run, or of a key already there", () => {
    refusedIn(list(1, 2), [{ op: "insert", parent: key(1), before: key(99), node: item(3) }], "unknown-key");
    refusedIn(list(1, 2), [{ op: "insert", parent: key(1), before: key(111), node: item(3) }], "unknown-key");
    refusedIn(list(1, 2), [{ op: "insert", parent: key(111), node: item(3) }], "unsupported-patch");
    refusedIn(list(1, 2), [{ op: "insert", parent: key(1), node: item(2) }], "duplicate-key");
    refusedIn(list(1, 2), [{ op: "insert", parent: key(1), node: node(20, "button", { nope: "x" }) }], "unrealized-prop");
  });

  it("structure: the root can't be removed or moved, and a move needs a real sibling", () => {
    refusedIn(list(1, 2), [{ op: "remove", key: key(1) }], "unsupported-patch");
    refusedIn(list(1, 2), [{ op: "move", key: key(1) }], "unsupported-patch");
    refusedIn(list(1, 2), [{ op: "move", key: key(11), before: key(11) }], "unknown-key");
    refusedIn(list(1, 2), [{ op: "move", key: key(11), before: key(99) }], "unknown-key");
  });

  it("structure: a part that an earlier operation removed is gone for the later ones, and nothing of an earlier valid one is applied", () => {
    refusedIn(list(1, 2), [{ op: "remove", key: key(12) }, { op: "setText", key: key(112), text: "x" }], "unknown-key");
    refusedIn(list(1, 2), [{ op: "remove", key: key(12) }, { op: "move", key: key(11), before: key(12) }], "unknown-key");
    refusedIn(list(1, 2), [{ op: "remove", key: key(12) }, { op: "insert", parent: key(1), before: key(12), node: item(3) }], "unknown-key");
    refusedIn(list(1, 2, 3), [{ op: "move", key: key(13), before: key(11) }, { op: "remove", key: key(99) }], "unknown-key");
  });

  it("nothing is drawn: patch needs a drawn tree", () => {
    const { port } = setup();
    expect(() => port.patch(patches())).toThrowError(expect.objectContaining({ code: "not-drawn" }));
  });
});

describe("patch: a DOM setter that throws", () => {
  it("reports patch-failed with the cause, and keeps the steps before it", () => {
    const primitives = {
      page: { element: "section", props: { title: attribute("aria-label"), flaky: property("flaky", "value") } },
      text: { element: "span" },
    };
    const { container, port } = setup(primitives);
    port.draw(tree(node(1, "page", { title: "a" }, [text(2, "t")])));
    const section = container.querySelector("section")!;
    Object.defineProperty(section, "flaky", { set() { throw new Error("no"); }, get: () => undefined });

    try {
      port.patch(patches(
        { op: "setProp", key: key(1), prop: "title", value: "b" },
        { op: "setProp", key: key(1), prop: "flaky", value: 1 },
      ));
      expect.unreachable("patch must throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WebRealizationError);
      expect((error as WebRealizationError).code).toBe("patch-failed");
      expect(((error as WebRealizationError).cause as Error).message).toBe("no");
    }

    expect(section.getAttribute("aria-label")).toBe("b");
    // The composer recovers with a full draw, which works.
    port.draw(tree(node(1, "page", { title: "c" }, [text(2, "t")])));
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("c");
  });
});

describe("patch after other operations", () => {
  it("works after update, which creates parts, and after hydrate-less redraws, and not for a removed key", () => {
    const { container, port } = setup();
    port.draw(tree(node(1, "page", { title: "a" }, [node(2, "button", {}, [text(3, "x")])])));
    port.update(tree(node(1, "page", { title: "a" }, [node(4, "button", { disabled: false }, [text(5, "y")])])));
    port.patch(patches({ op: "setProp", key: key(4), prop: "disabled", value: true }));
    expect(container.querySelector("button")!.hasAttribute("disabled")).toBe(true);
    expect(() => port.patch(patches({ op: "setProp", key: key(2), prop: "disabled", value: true }))).toThrowError(expect.objectContaining({ code: "unknown-key" }));
    port.unmount();
    expect(() => port.patch(patches())).toThrowError(expect.objectContaining({ code: "not-drawn" }));
  });

  it("a part drawn again under the same key is found", () => {
    const { container, port } = setup();
    port.draw(view("a", "x", false));
    port.draw(view("b", "y", false));
    port.patch(patches({ op: "setText", key: key(2), text: "again" }));
    expect(container.querySelector("section")!.firstChild!.textContent).toBe("again");
  });
});

// Used so the imports are checked even where a case above doesn't need them.
void booleanAttribute;
