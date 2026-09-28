// The Web PORT against the PORT contract (docs/CONTRACT.md), with MESH's
// real output wherever the slice reaches, and hand-written render-v1 trees
// for the edge cases it doesn't.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { beforeAll, describe, expect, it } from "vitest";

import { UNKNOWN_COMPONENT_ELEMENT, WebRealizationError, attribute, booleanAttribute, createWebPort } from "../src/index.js";

import { dom, domNodes, handler, node, program, read, readJson, reports, slicePrimitives, sliceProgram, text, tree, treeOf } from "./support.js";

let first: RenderTree;
let second: RenderTree;
let otherProgram: RenderTree;

beforeAll(async () => {
  const slice = await sliceProgram();
  first = await treeOf(slice, readJson("snapshots/first.json"));
  second = await treeOf(slice, readJson("snapshots/second.json"));
  // A different program: the slice with its button's label changed, so every key may differ.
  const changed = await program({ users: read("users.mprx").replace("Refresh", "Reload"), "user-card": read("user-card.mprx") }, "users");
  otherProgram = await treeOf(changed, readJson("snapshots/first.json"));
});

const nodesOf = (root: RenderNode): ReadonlyArray<RenderNode> => [root, ...root.children.flatMap((child) => child.type === "node" ? nodesOf(child) : [])];

const expectedFirst =
  '<section aria-label="Team">'
  + '<section aria-label="Ada Lovelace"><img alt="Ada Lovelace" data-size="sm" src="ada.png"><span>Ada Lovelace</span></section>'
  + '<section aria-label="Grace Hopper"><img alt="Grace Hopper" data-size="md"><span>Grace Hopper (inactive)</span></section>'
  + "<button>Refresh</button>"
  + "</section>";

describe("the input", () => {
  it("is MESH's real output: the published packages give MESH's reviewed tree", () => {
    expect(first).toEqual(readJson("expected/first.tree.json"));
  });

  it("refuses a tree of another format or version", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    for (const wrong of [{ ...first, version: 2 }, { ...first, format: "other" }]) {
      expect(() => port.draw(wrong as unknown as RenderTree)).toThrow(expect.objectContaining({ code: "unsupported-tree" }));
    }
  });

  it("ignores properties it doesn't know, as render-v1 requires", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });
    const extended = { ...first, future: true, root: { ...first.root, hint: "x" } } as unknown as RenderTree;

    port.draw(extended);

    expect(container.innerHTML).toBe(expectedFirst);
  });
});

describe("draw", () => {
  it("realizes MESH's tree as DOM: primitives as their elements, props as given, text runs as text", () => {
    const { container } = dom();
    createWebPort({ container, primitives: slicePrimitives, report: () => {} }).draw(first);

    // Grace's avatar has no src: the prop is absent, so there is no attribute, not an empty one.
    expect(container.innerHTML).toBe(expectedFirst);
  });

  it("realizes an empty text run as an empty text node, not nothing", () => {
    const { container } = dom();
    createWebPort({ container, primitives: slicePrimitives, report: () => {} }).draw(tree(node(1, "text", {}, [text(2, "")])));

    const span = container.firstChild!;
    expect(span.childNodes).toHaveLength(1);
    expect(span.firstChild!.nodeType).toBe(3);
    expect(span.textContent).toBe("");
  });

  it("surfaces a component it has no realization for, with its children, instead of dropping it", () => {
    const { container } = dom();
    createWebPort({ container, primitives: slicePrimitives, report: () => {} })
      .draw(tree(node(1, "page", { title: "T" }, [node(2, "user-card", { user: { id: "u1" } }, [text(3, "inside")])])));

    const unknown = container.querySelector(UNKNOWN_COMPONENT_ELEMENT)!;
    expect(unknown.getAttribute("data-component")).toBe("user-card");
    expect(unknown.textContent).toBe("inside");
  });

  it("draws a different program afresh: no DOM node is reused", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(first);
    const before = new Set(domNodes(container.firstChild!));
    port.draw(otherProgram);

    expect(container.querySelector("button")!.textContent).toBe("Reload");
    expect(domNodes(container.firstChild!).filter((n) => before.has(n))).toEqual([]);
  });
});

describe("update", () => {
  it("keeps every key's DOM node, and changes exactly what MESH says changed", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(first);
    const before = domNodes(container.firstChild!);
    port.update(second);
    const after = domNodes(container.firstChild!);

    // Identity: the same DOM nodes, in the same places.
    expect(after).toHaveLength(before.length);
    after.forEach((n, index) => expect(n).toBe(before[index]));

    // What changed: expected/first-to-second.changes, realized.
    expect(read("expected/first-to-second.changes").trim().split("\n")).toHaveLength(4);
    expect(container.innerHTML).toBe(expectedFirst
      .replace('aria-label="Ada Lovelace"', 'aria-label="Ada King"')
      .replace('alt="Ada Lovelace" data-size="sm" src="ada.png"', 'alt="Ada King" data-size="sm" src="ada-2.png"')
      .replace("<span>Ada Lovelace</span>", "<span>Ada King</span>"));
  });

  it("removes an attribute when its prop becomes absent, and restores it when it comes back", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });
    const avatar = (props: Record<string, string>) => tree(node(1, "avatar", { alt: "A", ...props }));

    port.draw(avatar({ src: "a.png" }));
    const img = container.firstChild as Element;
    port.update(avatar({}));
    expect(img.hasAttribute("src")).toBe(false);
    port.update(avatar({ src: "b.png" }));
    expect(container.firstChild).toBe(img);
    expect(img.getAttribute("src")).toBe("b.png");
  });

  it("realizes a boolean attribute by presence", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });
    const button = (disabled?: boolean) => tree(node(1, "button", disabled === undefined ? {} : { disabled }, [text(2, "Go")]));

    port.draw(button(true));
    expect(container.innerHTML).toBe('<button disabled="">Go</button>');
    port.update(button(false));
    expect(container.innerHTML).toBe("<button>Go</button>");
    port.update(button(true));
    port.update(button());
    expect(container.innerHTML).toBe("<button>Go</button>");
  });

  it("treats a key only in the new tree as new, and one only in the old tree as gone", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(tree(node(1, "page", { title: "T" }, [node(2, "text", {}, [text(3, "kept")]), node(4, "text", {}, [text(5, "gone")])])));
    const kept = container.querySelector("span")!;
    port.update(tree(node(1, "page", { title: "T" }, [node(2, "text", {}, [text(3, "kept")]), node(6, "button", {}, [text(7, "new")])])));

    expect(container.innerHTML).toBe('<section aria-label="T"><span>kept</span><button>new</button></section>');
    expect(container.querySelector("span")).toBe(kept);
  });

  it("needs a drawn tree", () => {
    const { container } = dom();

    expect(() => createWebPort({ container, primitives: slicePrimitives, report: () => {} }).update(first))
      .toThrow(expect.objectContaining({ code: "not-drawn" }));
  });
});

// docs/CONTRACT.md, "Program continuity": PORT never determines whether two
// trees come from one program. draw and update carry that fact from the
// composer, and PORT infers it from nothing in the tree.
describe("program continuity is the composer's, never inferred by PORT", () => {
  it("draw reuses nothing, even for the very tree already drawn", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(first);
    const before = new Set(domNodes(container.firstChild!));
    port.draw(first);

    expect(container.innerHTML).toBe(expectedFirst);
    expect(domNodes(container.firstChild!).filter((n) => before.has(n))).toEqual([]);
  });

  it("draw reuses nothing for a tree of the same program whose keys all match", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(first);
    const before = new Set(domNodes(container.firstChild!));
    port.draw(second);

    expect(domNodes(container.firstChild!).filter((n) => before.has(n))).toEqual([]);
  });

  it("draw doesn't reconcile a tree whose keys happen to coincide with the drawn one's", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });
    const shaped = (label: string) => tree(node(1, "page", { title: "T" }, [node(2, "button", {}, [text(3, label)], { click: handler(1) })]));

    port.draw(shaped("A"));
    const button = container.querySelector("button")!;
    port.draw(shaped("B"));

    expect(container.querySelector("button")).not.toBe(button);
    expect(container.querySelector("button")!.textContent).toBe("B");
  });

  it("update reconciles by key whatever the handler identifiers say about their program", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives: slicePrimitives, report });
    // Handler identifiers begin with part of their program's identity. PORT never reads it.
    const otherProgramHandler = `hBBBBBBBBBBB.${"B".repeat(22)}`;

    port.draw(tree(node(1, "button", {}, [text(2, "Go")], { click: handler(1) })));
    const button = container.querySelector("button")!;
    port.update(tree(node(1, "button", {}, [text(2, "Go")], { click: otherProgramHandler })));
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(container.querySelector("button")).toBe(button);
    expect(calls).toEqual([[otherProgramHandler]]);
  });

  it("update never turns into a draw, even for a tree of an entirely different shape", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

    port.draw(tree(node(1, "page", { title: "T" }, [node(2, "text", {}, [text(3, "kept")])])));
    const page = container.firstChild;
    const span = container.querySelector("span");
    port.update(tree(node(1, "page", { title: "U" }, [node(2, "text", {}, [text(3, "kept")]), node(4, "button", {}, [text(5, "added")]), node(6, "text", {}, [])])));

    // Keys 1, 2 and 3 are kept; 4, 5 and 6 are new. No wholesale redraw.
    expect(container.firstChild).toBe(page);
    expect(container.querySelector("span")).toBe(span);
    expect(container.innerHTML).toBe('<section aria-label="U"><span>kept</span><button>added</button><span></span></section>');
  });
});

describe("nothing is dropped silently, and a refused tree changes nothing", () => {
  const cases: ReadonlyArray<[string, RenderTree, string]> = [
    ["a prop with no realization", tree(node(1, "page", { title: "T", subtitle: "S" })), "unrealized-prop"],
    ["an event with no realization", tree(node(1, "page", { title: "T" }, [], { click: handler(1) })), "unrealized-event"],
    // A text-only slot takes MESH's propText for a number, boolean or null; without one, the PORT must not make one.
    ["a number with no propText for an attribute", tree(node(1, "avatar", { alt: "A", size: 48 })), "missing-prop-text"],
    ["null with no propText for an attribute", tree(node(1, "avatar", { alt: "A", src: null })), "missing-prop-text"],
    ["a boolean with no propText for an attribute", tree(node(1, "avatar", { alt: "A", size: true })), "missing-prop-text"],
    ["a string for a boolean attribute", tree(node(1, "button", { disabled: "yes" })), "unrealizable-value"],
    // A list or record has no MESH text (§9.7.8), so no text-only slot can hold it.
    ["a list for an attribute", tree(node(1, "avatar", { alt: "A", size: ["s", "m"] })), "unrealizable-value"],
    ["a record for an attribute", tree(node(1, "avatar", { alt: "A", size: { w: "1" } })), "unrealizable-value"],
    ["null for a boolean attribute", tree(node(1, "button", { disabled: null })), "unrealizable-value"],
    ["a number for a boolean attribute", tree(node(1, "button", { disabled: 1 })), "unrealizable-value"],
    ["two parts with one key", tree(node(1, "page", { title: "T" }, [text(1, "x")])), "duplicate-key"],
    // Known render-v1 content with nowhere to go: children under a void element would never show.
    ["children under a void element", tree(node(1, "avatar", { alt: "A" }, [text(2, "caption")])), "unrealizable-children"],
    ["even an empty text run under a void element", tree(node(1, "avatar", { alt: "A" }, [text(2, "")])), "unrealizable-children"],
  ];

  for (const [what, bad, code] of cases) {
    it(`${what}: ${code}`, () => {
      const { container } = dom();
      const port = createWebPort({ container, primitives: slicePrimitives, report: () => {} });

      port.draw(first);
      const html = container.innerHTML;
      const nodes = domNodes(container.firstChild!);

      expect(() => port.update(bad)).toThrow(WebRealizationError);
      expect(() => port.update(bad)).toThrow(expect.objectContaining({ code }));
      expect(() => port.draw(bad)).toThrow(expect.objectContaining({ code }));
      expect(container.innerHTML).toBe(html);
      expect(domNodes(container.firstChild!)).toEqual(nodes);
    });
  }
});

describe("interaction reports", () => {
  const click = (window: ReturnType<typeof dom>["window"], target: Element, x = 0, y = 0) =>
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));

  it("reports the drawn tree's handler identifier and the payload the realization builds", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    createWebPort({ container, primitives: slicePrimitives, report }).draw(first);

    click(window, container.querySelectorAll("img")[0]!, 1, 2);
    click(window, container.querySelector("button")!);

    const avatars = nodesOf(first.root).filter((n) => n.component === "avatar");
    const button = nodesOf(first.root).find((n) => n.component === "button")!;
    expect(calls).toEqual([[avatars[0]!.events["click"], { x: 1, y: 2 }], [button.events["click"]]]);
    // An event with no payload is reported without one: absent, not undefined.
    expect(calls[1]).toHaveLength(1);
  });

  it("keeps reporting after an update, with the updated tree's handler identifiers", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives: slicePrimitives, report });

    port.draw(tree(node(1, "button", {}, [text(2, "Go")], { click: handler(1) })));
    port.update(tree(node(1, "button", {}, [text(2, "Go")], { click: handler(2) })));
    click(window, container.querySelector("button")!);

    expect(calls).toEqual([[handler(2)]]);
  });

  it("reports nothing from what a new draw or unmount removed", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives: slicePrimitives, report });

    port.draw(first);
    const old = container.querySelector("button")!;
    port.draw(otherProgram);
    click(window, old);
    expect(calls).toEqual([]);

    const current = container.querySelector("button")!;
    port.unmount();
    click(window, current);
    expect(calls).toEqual([]);
    expect(container.childNodes).toHaveLength(0);
  });

  it("reports nothing from a node an update removed or replaced", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives: slicePrimitives, report });

    port.draw(tree(node(1, "page", { title: "T" }, [node(2, "button", {}, [], { click: handler(1) }), node(3, "button", {}, [], { click: handler(2) })])));
    const [replaced, removed] = Array.from(container.querySelectorAll("button"));
    port.update(tree(node(1, "page", { title: "T" }, [node(4, "button", {}, [], { click: handler(3) })])));
    click(window, replaced!);
    click(window, removed!);
    click(window, container.querySelector("button")!);

    expect(calls).toEqual([[handler(3)]]);
  });

  it("realizes an event as the DOM event type its realization names", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const primitives = { field: { element: "input", props: { value: attribute("value"), disabled: booleanAttribute("disabled") }, events: { change: { type: "input", payload: (event: Event) => (event.target as HTMLInputElement).value } } } };
    createWebPort({ container, primitives, report }).draw(tree(node(1, "field", { value: "a" }, [], { change: handler(3) })));

    const input = container.querySelector("input")!;
    input.value = "typed";
    input.dispatchEvent(new window.Event("input", { bubbles: true }));

    expect(calls).toEqual([[handler(3), "typed"]]);
  });
});
