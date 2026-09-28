// Event resolution (MESH §9.9): one interaction reaches at most one
// binding, the first from the interacted node towards the root whose
// primitive has an applicable event for it and binds that event. These are
// contract tests. MESH's own language-neutral cases run in
// conformance.test.ts; these add the Web-specific ways the DOM could leak
// into the result.
import { describe, expect, it } from "vitest";

import { WebRealizationError, createWebPort } from "../src/index.js";

import { dom, handler, node, reports, text, tree } from "./support.js";

// `card` and `button` both have a `click`, realized by the same DOM event
// type: two unrelated events that share a name and a DOM type (§9.9.1).
const primitives = {
  card: { element: "div", events: { click: { type: "click" }, dismiss: { type: "keydown" } } },
  row: { element: "div", events: { select: { type: "click" } } },
  button: { element: "button", events: { click: { type: "click" }, press: { type: "pointerdown" } } },
  label: { element: "span" },
};

const setup = (root: Parameters<typeof tree>[0]) => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });
  port.draw(tree(root));
  const fire = (target: Node, type = "click", init: EventInit = { bubbles: true }) => target.dispatchEvent(new window.Event(type, init));

  return { window, container, calls, port, fire };
};

describe("event resolution: innermost to root, first qualifying binding, one report", () => {
  it("the child's binding wins over its ancestor's binding for the same event", () => {
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { click: handler(2) })], { click: handler(1) }));

    fire(container.querySelector("button")!);

    expect(calls).toEqual([[handler(2)]]);
  });

  it("an interaction on a node's text run is the node's", () => {
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { click: handler(2) })], { click: handler(1) }));

    fire(container.querySelector("button")!.firstChild!);

    expect(calls).toEqual([[handler(2)]]);
  });

  it("the ancestor's binding is selected when the child has no applicable binding", () => {
    // The button binds `press` only: `click` is its applicable event, and it doesn't bind it.
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { press: handler(2) })], { click: handler(1) }));

    fire(container.querySelector("button")!);

    expect(calls).toEqual([[handler(1)]]);
  });

  it("a node with no realization of the interaction, or an unknown component, is passed over", () => {
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "mystery", {}, [node(3, "label", {}, [text(4, "Go")])])], { click: handler(1) }));

    fire(container.querySelector("span")!);

    expect(calls).toEqual([[handler(1)]]);
  });

  it("only one report per interaction, however many ancestors bind an applicable event", () => {
    const { container, calls, fire } = setup(
      node(1, "card", {}, [node(2, "row", {}, [node(3, "button", {}, [text(4, "Go")], { click: handler(3) })], { select: handler(2) })], { click: handler(1) }));

    fire(container.querySelector("button")!);
    fire(container.querySelector("button")!.parentElement!);

    expect(calls).toEqual([[handler(3)], [handler(2)]]);
  });

  it("differently named events of different primitives are unrelated, even on one DOM event type", () => {
    // The row's `select` and the card's `click` are both realized by "click":
    // the row is nearer, so it alone receives it.
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "row", {}, [node(3, "label", {}, [text(4, "Go")])], { select: handler(2) })], { click: handler(1) }));

    fire(container.querySelector("span")!);

    expect(calls).toEqual([[handler(2)]]);
  });

  it("unrelated bindings don't fire: siblings, and bindings for other interactions", () => {
    const { container, calls, fire } = setup(node(1, "card", {}, [
      node(2, "button", {}, [text(3, "A")], { click: handler(2) }),
      node(4, "button", {}, [text(5, "B")], { press: handler(4) }),
    ], { dismiss: handler(1) }));
    const [a, b] = Array.from(container.querySelectorAll("button"));

    fire(b!);
    expect(calls).toEqual([]);

    fire(a!, "pointerdown");
    expect(calls).toEqual([]);

    fire(a!);
    expect(calls).toEqual([[handler(2)]]);
  });

  it("an interaction nothing qualifies for resolves to nothing", () => {
    const { container, calls, fire } = setup(node(1, "card", {}, [node(2, "label", {}, [text(3, "Go")])]));

    fire(container.querySelector("span")!);
    fire(container.querySelector("span")!, "keydown");

    expect(calls).toEqual([]);
  });

  it("the payload is built for the receiving node, with its element, not the DOM target", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    const withPayload = { ...primitives, card: { element: "div", events: { click: { type: "click", payload: (_event: Event, element: Element) => element.tagName.toLowerCase() } } } };
    createWebPort({ container, primitives: withPayload, report }).draw(tree(node(1, "card", {}, [node(2, "label", {}, [text(3, "Go")])], { click: handler(1) })));

    container.querySelector("span")!.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(calls).toEqual([[handler(1), "div"]]);
  });

  it("refuses a table where one DOM event type constitutes two events of one primitive", () => {
    const { container } = dom();
    const ambiguous = { button: { element: "button", events: { click: { type: "click" }, press: { type: "click" } } } };

    expect(() => createWebPort({ container, primitives: ambiguous, report: () => {} })).toThrow(WebRealizationError);
    expect(() => createWebPort({ container, primitives: ambiguous, report: () => {} })).toThrow(expect.objectContaining({ code: "invalid-primitives" }));
  });
});

// The DOM's own propagation must not become Valance semantics: the result
// may not depend on whether a DOM event bubbles, on the order the DOM
// delivers it to elements, or on what other code on the page does to it.
describe("event resolution doesn't depend on DOM propagation", () => {
  const nested = node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { click: handler(2) })], { click: handler(1) });

  it("resolves an interaction whose DOM event doesn't bubble", () => {
    const { container, calls, fire } = setup(nested);

    fire(container.querySelector("button")!, "click", { bubbles: false });
    fire(container.querySelector("button")!.firstChild!, "click", { bubbles: false });

    expect(calls).toEqual([[handler(2)], [handler(2)]]);
  });

  it("isn't changed by other code stopping the DOM event at the target or between it and the container", () => {
    const { container, calls, fire } = setup(nested);
    const button = container.querySelector("button")!;
    const card = container.querySelector("div")!;
    button.addEventListener("click", (event) => event.stopImmediatePropagation());
    card.addEventListener("click", (event) => event.stopPropagation(), true);

    fire(button);

    expect(calls).toEqual([[handler(2)]]);
  });

  it("stops nothing: the DOM event still reaches other code on the page, once", () => {
    const { window, container, calls, fire } = setup(nested);
    const seen: Array<string> = [];
    window.document.body.addEventListener("click", () => seen.push("body"));

    fire(container.querySelector("button")!);

    expect(calls).toEqual([[handler(2)]]);
    expect(seen).toEqual(["body"]);
  });

  it("walks the render tree, whatever elements other code put between the DOM nodes", () => {
    const { window, container, calls, fire } = setup(nested);
    const button = container.querySelector("button")!;
    // Foreign markup around the button: it isn't part of the drawn tree.
    const wrapper = window.document.createElement("em");
    button.replaceWith(wrapper);
    wrapper.append(button);

    fire(wrapper);
    fire(button);

    expect(calls).toEqual([[handler(1)], [handler(2)]]);
  });

  it("keeps the node when an update changes a binding, and resolves with the drawn tree's", () => {
    const { container, calls, port, fire } = setup(nested);
    const button = container.querySelector("button")!;

    // The button stops binding `click`: the card receives the interaction now.
    port.update(tree(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { press: handler(5) })], { click: handler(1) })));
    fire(button);

    expect(container.querySelector("button")).toBe(button);
    expect(calls).toEqual([[handler(1)]]);
  });

  it("reports nothing after unmount, and nothing for an interaction outside the drawn tree", () => {
    const { window, container, calls, port, fire } = setup(nested);
    const button = container.querySelector("button")!;

    fire(container);
    fire(window.document.body);
    port.unmount();
    container.append(button);
    fire(button);

    expect(calls).toEqual([]);
  });
});
