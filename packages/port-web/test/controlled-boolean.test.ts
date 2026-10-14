// `controlledBoolean`: a flag the user can change (a checkbox's `checked`) that has an HTML form. It is the boolean attribute and the DOM property, kept equal to what was rendered after every
// presentation, so a ticked checkbox can be server-rendered, hydrated, and corrected when the application declines a change.
import type { WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { attribute, controlledBoolean, createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, node, tree } from "./support.js";
import { expectParity, hydrated } from "./ssr-support.js";

const primitives: WebPrimitives = {
  checkbox: { element: "input", attributes: { type: "checkbox" }, props: { checked: controlledBoolean("checked"), label: attribute("aria-label") } },
};

const ticked = (on: boolean) => tree(node(1, "checkbox", { checked: on, label: "Done" }));

describe("controlledBoolean", () => {
  it("has an HTML form: present when true, absent when false, so a ticked checkbox server-renders", () => {
    expect(realizeHtml(ticked(true), primitives)).toBe('<input aria-label="Done" checked type="checkbox">');
    expect(realizeHtml(ticked(false), primitives)).toBe('<input aria-label="Done" type="checkbox">');
  });

  it("hydrates to what a fresh draw realizes, ticked or not", () => {
    expectParity(ticked(true), primitives);
    expectParity(ticked(false), primitives);
  });

  it("is verified by hydration: a server checkbox that disagrees on the flag is a mismatch", () => {
    expect(hydrated(ticked(true), primitives, '<input aria-label="Done" type="checkbox">').result).toMatchObject({ mismatch: { class: "boolean-attribute" } });
  });

  it("reasserts what was rendered: a change the application declines is put back by the next presentation", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });

    port.draw(ticked(false));

    const input = container.firstElementChild as HTMLInputElement;

    expect(input.checked).toBe(false);
    input.checked = true; // the person ticks it, and the application commits nothing
    port.update(ticked(false));
    expect(input.checked).toBe(false);
    expect(input.hasAttribute("checked")).toBe(false);
    port.update(ticked(true)); // the application accepts one
    expect(input.checked).toBe(true);
    expect(input.hasAttribute("checked")).toBe(true);
    input.checked = false;
    port.update(ticked(true));
    expect(input.checked).toBe(true);
  });

  it("refuses a value that is not a boolean", () => {
    const { container } = dom();

    expect(() => createWebPort({ container, primitives, report: () => {} }).draw(tree(node(1, "checkbox", { checked: "yes", label: "Done" })))).toThrow(/boolean/);
  });
});
