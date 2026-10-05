// The `controlled` realization: a text slot that is the content attribute AND the same-named DOM property, for a field the user edits (an input's `value`).
// Contract: it has an HTML form (like `attribute`); after every draw, update and hydrate the property equals the rendered text, whatever the user did and whether or not the
// text changed; it is written only when it differs; a focused field keeps its selection; nothing is written between presentations (so an edit the application declines by
// committing nothing stays until the next presentation); text typed before hydration is replaced by the rendered text.
import type { WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { attribute, controlled, createWebPort, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { node, reports, tree } from "./support.js";
import { dom } from "./support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  field: { element: "input", props: { value: controlled("value"), label: attribute("aria-label") } },
};
const page = (props: Readonly<Record<string, string>> | undefined) => tree(node(1, "page", {}, [node(2, "field", props ?? {})]));

const setup = (html?: string) => {
  const { window, container } = dom();

  if (html !== undefined) {
    container.innerHTML = html;
  }

  const port = createWebPort({ container, primitives, report: reports().report });
  const input = (): HTMLInputElement => container.querySelector("input")!;
  /** The reader types: the DOM changes, and the application is told elsewhere. */
  const type = (value: string) => { input().value = value; };

  return { window, container, port, input, type };
};

/** Counts the writes the PORT makes to an element's `value` property. */
const countWrites = (element: HTMLInputElement): { count: number } => {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")!;
  const counter = { count: 0 };

  Object.defineProperty(element, "value", { configurable: true, get: () => descriptor.get!.call(element), set: (next: string) => { counter.count += 1; descriptor.set!.call(element, next); } });

  return counter;
};

describe("controlled: the server form and hydration are the attribute's", () => {
  it("serializes as the content attribute, and absent omits it", () => {
    expect(realizeHtml(page({ value: "st" }), primitives)).toBe('<section><input value="st"></section>');
    expect(realizeHtml(page({}), primitives)).toBe("<section><input></section>");
  });

  it("hydrate verifies the attribute, adopts, and the property equals the rendered text", () => {
    const { port, input } = setup('<section><input value="st"></section>');

    expect(port.hydrate(page({ value: "st" }))).toEqual({ adopted: true });
    expect(input().value).toBe("st");
  });

  it("a server attribute that disagrees with the tree is an ordinary attribute mismatch", () => {
    const { port } = setup('<section><input value="other"></section>');
    const result = port.hydrate(page({ value: "st" }));

    expect(result).toMatchObject({ adopted: false, mismatch: { class: "attribute" } });
  });

  it("text typed before hydration is replaced by the rendered text: the application's value", () => {
    const { port, input, type } = setup('<section><input value=""></section>');

    type("typed early");
    port.hydrate(page({ value: "" }));
    expect(input().value).toBe("");
  });
});

describe("controlled: after every presentation the field shows what was rendered", () => {
  it("draw writes the attribute and the property", () => {
    const { port, input } = setup();

    port.draw(page({ value: "st" }));
    expect(input().getAttribute("value")).toBe("st");
    expect(input().value).toBe("st");
  });

  it("the benchmark's case: the reader typed, the application reset the value: the box is emptied", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "" }));
    type("st");                                                    // the application will answer with ""
    port.update(page({ value: "st" }));                            // it first took the edit...
    port.update(page({ value: "" }));                              // ...then cleared it
    expect(input().value).toBe("");
  });

  it("an application that rewrites the value is obeyed", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "" }));
    type("st");
    port.update(page({ value: "ST" }));
    expect(input().value).toBe("ST");
  });

  it("a declined edit with a presentation: the render is unchanged, and the next presentation still reasserts the application's value", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "" }));
    type("x");
    port.update(page({ value: "" }));                              // unchanged render (the previous output equals this one)
    expect(input().value).toBe("");
  });

  it("a declined edit with NO presentation: nothing is written between presentations, so the typed text stays until the next one", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "" }));
    type("x");
    expect(input().value).toBe("x");                               // the PORT cannot know the application's decision, and does not guess
    port.update(page({ value: "" }));
    expect(input().value).toBe("");
  });

  it("an absent prop restores the element's own initial value and removes the attribute", () => {
    const { port, input } = setup();

    port.draw(page({ value: "st" }));
    port.update(page({}));
    expect(input().value).toBe("");
    expect(input().hasAttribute("value")).toBe(false);
  });
});

describe("controlled: only what differs is written, and typing is not disturbed", () => {
  it("a field that already agrees is not written", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "" }));

    const writes = countWrites(input());

    type("st");                                                    // the reader's own typing is not a PORT write: reset the count after it
    writes.count = 0;
    port.update(page({ value: "st" }));                            // the application took the edit: DOM already agrees
    port.update(page({ value: "st" }));
    expect(writes.count).toBe(0);
    port.update(page({ value: "ST" }));
    expect(writes.count).toBe(1);
  });

  it("a focused field keeps its selection, clamped to the new length", () => {
    const { port, input, type } = setup();

    port.draw(page({ value: "abXc" }));
    type("abXc");                                                  // the reader has typed: the field's value is now its own (the DOM's dirty flag), not the attribute's
    input().focus();
    input().setSelectionRange(3, 3);                               // the reader's caret is after the X
    port.update(page({ value: "abYc" }));                          // the application normalizes the text, same length
    expect(input().value).toBe("abYc");
    expect(input().selectionStart).toBe(3);
    port.update(page({ value: "a" }));                             // shorter: clamped, not out of range
    expect(input().selectionStart).toBe(1);
  });

  it("is not the text-property realization: that one has no HTML form, and still has none", () => {
    expect(() => realizeHtml(page({ value: "st" }), { ...primitives, field: { element: "input", props: { value: textProperty("value") } } })).toThrow(/no HTML form/);
  });
});
