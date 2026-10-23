// Focus follows identity (I2, I12) and the host's request for focus (I13).
//
// A browser drops focus from an element that is moved or removed. The person did nothing, so the PORT puts it back: by key, with the selection of a
// text field; when the focused part is gone, on what follows it, then what precedes it, then what holds it. These cases look at the DOM's own
// `activeElement` and selection, and at what the PORT reports, never at the PORT's records.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { attribute, controlled, createWebPort, type WebPrimitives } from "../src/index.js";

import { dom, handler, node, reports, text, tree } from "./support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  scope: { element: "div", attributes: { tabindex: "-1" } },
  column: { element: "div" },
  label: { element: "span" },
  row: { element: "button", events: { click: { type: "click" } } },
  field: {
    element: "input",
    attributes: { type: "text" },
    props: { value: controlled("value"), name: attribute("name") },
    events: { focus: { type: "focus" }, blur: { type: "blur" } },
  },
};

const ID: Readonly<Record<string, number>> = { A: 11, B: 12, C: 13, D: 14 };

const row = (label: string): RenderNode => node(ID[label]!, "row", {}, [text(ID[label]! + 100, label)], { click: handler(ID[label]!) });
const field = (label: string, value = ""): RenderNode => node(ID[label]!, "field", { value, name: label }, [], { focus: handler(ID[label]! + 50), blur: handler(ID[label]! + 60) });
const page = (...children: ReadonlyArray<RenderNode>): RenderTree => tree(node(1, "page", {}, [node(2, "scope", {}, children)]));

const setup = () => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });
  const document = window.document;
  const active = (): string => {
    const at = document.activeElement;

    return at === null || at === document.body ? "body" : (at.textContent || (at as HTMLInputElement).name || at.localName);
  };

  return { window, document, container, port, calls, active };
};

const keys = (...labels: ReadonlyArray<string>): RenderTree => page(...labels.map(row));

describe("focus follows identity", () => {
  it("keeps focus on a row that moves, by update and by patch", () => {
    const { port, container, active } = setup();
    port.draw(keys("A", "B", "C"));
    (container.querySelectorAll("button")[1] as HTMLElement).focus();
    expect(active()).toBe("B");

    port.update(keys("C", "B", "A"));
    expect(active()).toBe("B");

    port.update(keys("B", "A", "C"));
    expect(active()).toBe("B");

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "move", key: node(ID.B!, "row").key, before: node(ID.C!, "row").key }] });
    expect(Array.from(container.querySelectorAll("button"), (b) => b.textContent)).toEqual(["A", "B", "C"]);
    expect(active()).toBe("B");
  });

  it("keeps a text field's selection and its direction across a move", () => {
    const { port, container, document } = setup();
    port.draw(page(row("B"), field("A", "hello world")));
    const input = container.querySelector("input")!;
    input.focus();
    input.setSelectionRange(2, 7, "backward");

    port.update(page(field("A", "hello world"), row("B")));

    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 7, "backward"]);
  });

  it("when the focused part is gone, goes to what follows it, else what precedes it", () => {
    const { port, container, active } = setup();
    port.draw(keys("A", "B", "C"));
    (container.querySelectorAll("button")[1] as HTMLElement).focus();
    port.update(keys("A", "C"));
    expect(active()).toBe("C");

    port.update(keys("A"));
    expect(active()).toBe("A");
  });

  it("when nothing is left beside it, goes to the nearest part that holds focus", () => {
    const { port, container, document } = setup();
    port.draw(keys("A"));
    (container.querySelector("button") as HTMLElement).focus();
    port.update(page());

    expect(document.activeElement).toBe(container.querySelector("div"));
  });

  it("leaves focus alone when it was never in the drawn tree, and when nothing moved", () => {
    const { port, container, document, active } = setup();
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.append(outside);
    port.draw(keys("A", "B"));
    outside.focus();
    port.update(keys("B", "A"));
    expect(active()).toBe("outside");

    (container.querySelector("button") as HTMLElement).focus();
    port.update(keys("B", "A"));
    expect(active()).toBe("B");
  });

  it("does not report the focus and blur its own moves make", () => {
    const { port, container, calls } = setup();
    port.draw(page(row("B"), field("A")));
    container.querySelector("input")!.focus();
    calls.length = 0;

    port.update(page(field("A"), row("B")));
    port.update(page(row("B")));

    expect(calls).toEqual([]);
  });

  it("still reports the person's own focus and blur", () => {
    const { port, container, calls } = setup();
    port.draw(page(field("A"), field("B")));
    const [a, b] = Array.from(container.querySelectorAll("input"));
    a!.focus();
    b!.focus();

    expect(calls.map(([id]) => id)).toEqual([handler(ID.A! + 50), handler(ID.A! + 60), handler(ID.B! + 50)]);
  });
});

describe("focus(key): the host asks (I13)", () => {
  it("focuses the part, or the first thing in it that takes focus", () => {
    const { port, container, document } = setup();
    port.draw(page(row("A"), node(ID.B!, "column", {}, [node(ID.C!, "label", {}, [text(120, "x")]), field("D")])));

    expect(port.focus(node(ID.B!, "column").key)).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("input"));

    expect(port.focus(node(ID.A!, "row").key)).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("button"));
  });

  it("is false for a key that is not drawn, for a text run, and for a part with nothing to focus", () => {
    const { port, document } = setup();
    port.draw(page(node(ID.B!, "column", {}, [node(ID.C!, "label", {}, [text(120, "x")])])));

    expect(port.focus("kZZZZZZZZZZZZZZZZZZZZZZ")).toBe(false);
    expect(port.focus(text(120, "x").key)).toBe(false);
    expect(port.focus(node(ID.B!, "column").key)).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });
});
