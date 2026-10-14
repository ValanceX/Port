// Constant attributes: what a primitive always is. A checkbox primitive is an `<input type="checkbox">` on every draw, in server HTML, and in what hydration verifies; a table that would make a
// constant carry data or code (a prop's attribute, an event handler, a URL slot) is refused by both sides.
import type { WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, key, node, tree } from "./support.js";
import { codeOf, expectParity, hydrated, parse } from "./ssr-support.js";

const primitives: WebPrimitives = {
  checkbox: { element: "input", attributes: { type: "checkbox" }, props: { checked: booleanAttribute("checked"), label: attribute("aria-label") } },
  field: { element: "input", attributes: { type: "search", autocomplete: "off" }, props: {} },
  plain: { element: "span" },
};

describe("constant attributes: realization", () => {
  it("are on the element a draw creates, before and beside the props", () => {
    const { container } = dom();

    createWebPort({ container, primitives, report: () => {} }).draw(tree(node(1, "checkbox", { checked: true, label: "Done" })));

    const input = container.firstElementChild as HTMLInputElement;

    expect(input.getAttribute("type")).toBe("checkbox");
    expect(input.type).toBe("checkbox");
    expect(input.checked).toBe(true); // a fresh element's checkedness follows its `checked` attribute
    expect(input.getAttribute("aria-label")).toBe("Done");
  });

  it("are in server HTML, in name order with the props, and parity with a client draw holds", () => {
    const t = tree(node(1, "checkbox", { checked: false, label: "Done" }));

    expect(realizeHtml(t, primitives)).toBe('<input aria-label="Done" type="checkbox">');
    expect(realizeHtml(tree(node(1, "checkbox", { checked: true, label: "Done" })), primitives)).toBe('<input aria-label="Done" checked type="checkbox">');
    expectParity(t, primitives);
    expectParity(tree(node(1, "field", {})), primitives);
  });

  it("are verified by hydration: markup without one, or with another value, is a mismatch and a fresh draw", () => {
    const t = tree(node(1, "checkbox", { checked: false, label: "Done" }));
    const wrong = hydrated(t, primitives, '<input aria-label="Done">');

    expect(wrong.result).toMatchObject({ mismatch: { class: "attribute", expected: 'type="checkbox"', found: "no type" } });
    expect(hydrated(t, primitives, '<input aria-label="Done" type="text">').result).toMatchObject({ mismatch: { class: "attribute" } });
    // and the fresh draw that follows has it
    expect((wrong.container.firstElementChild as Element).getAttribute("type")).toBe("checkbox");
    // an attribute nothing declares is still a mismatch
    expect(hydrated(t, primitives, '<input aria-label="Done" type="checkbox" extra="x">').result).toMatchObject({ mismatch: { class: "attribute" } });
    expect(parse(realizeHtml(t, primitives)).container.innerHTML).toBe('<input aria-label="Done" type="checkbox">');
  });

  it("a primitive without them is as it was", () => {
    expect(realizeHtml(tree(node(1, "plain", {})), primitives)).toBe("<span></span>");
  });
});

describe("constant attributes: the table", () => {
  const leaf = (component: string) => tree({ type: "node", key: key(1), component, props: {}, events: {}, children: [] });
  const refused = (table: WebPrimitives) => ({ client: codeOf(() => createWebPort({ container: dom().container, primitives: table, report: () => {} }).draw(leaf("p"))), server: codeOf(() => realizeHtml(leaf("p"), table)) });
  const INVALID = { client: "invalid-primitives", server: "invalid-primitives" };

  it("refuses a constant that is a prop's attribute, an event handler, a URL slot, another constant's name twice, or not a plain name or string", () => {
    expect(refused({ p: { element: "input", attributes: { type: "checkbox" }, props: { kind: attribute("type") } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { onclick: "go()" } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { href: "https://example.com" } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { src: "x.png" } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { "Bad Name": "x" } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { "data-component": "x" } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { title: 1 as unknown as string } } })).toEqual(INVALID);
    expect(refused({ p: { element: "span", attributes: { title: "ok" } } })).toEqual({ client: "realized", server: "realized" });
  });
});
