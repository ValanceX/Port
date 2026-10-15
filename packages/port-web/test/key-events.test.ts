// An event made by one key: `{ type: "keydown", key: "Enter" }` is what a person does by pressing Enter in a field. Any other key is not that event, at that node, and the interaction goes on toward
// the root like any that does not apply.
import type { WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { codeOf } from "./ssr-support.js";
import { dom, handler, key as keyOf, node, reports, tree } from "./support.js";

const primitives: WebPrimitives = {
  field: { element: "input", events: { submit: { type: "keydown", key: "Enter" } } },
  form: { element: "div", events: { anyKey: { type: "keydown" } } },
};

const press = (container: Element, window: { readonly KeyboardEvent: typeof KeyboardEvent }, target: Element, key: string) =>
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));

describe("an event realized by one key", () => {
  it("is reported for that key and for no other", () => {
    const { window, container } = dom();
    const { calls, report } = reports();

    createWebPort({ container, primitives, report }).draw(tree(node(1, "field", {}, [], { submit: handler(1) })));

    const input = container.firstElementChild!;

    press(container, window as never, input, "a");
    press(container, window as never, input, "Tab");
    expect(calls).toEqual([]);
    press(container, window as never, input, "Enter");
    expect(calls).toEqual([[handler(1)]]);
  });

  it("goes on toward the root when the key is not its own: an ancestor that takes any key gets it", () => {
    const { window, container } = dom();
    const { calls, report } = reports();

    createWebPort({ container, primitives, report }).draw(tree(node(1, "form", {}, [node(2, "field", {}, [], { submit: handler(2) })], { anyKey: handler(1) })));

    const input = container.querySelector("input")!;

    press(container, window as never, input, "x");
    expect(calls).toEqual([[handler(1)]]);
    press(container, window as never, input, "Enter");
    expect(calls).toEqual([[handler(1)], [handler(2)]]);
  });

  it("is refused by a table that gives a key to an event that is not a keyboard event, or an empty or oversized one", () => {
    const leaf = tree({ type: "node", key: keyOf(1), component: "p", props: {}, events: {}, children: [] });
    const refused = (events: NonNullable<WebPrimitives[string]["events"]>) => {
      const table: WebPrimitives = { p: { element: "span", events } };

      return { client: codeOf(() => createWebPort({ container: dom().container, primitives: table, report: () => {} }).draw(leaf)), server: codeOf(() => realizeHtml(leaf, table)) };
    };
    const INVALID = { client: "invalid-primitives", server: "invalid-primitives" };

    expect(refused({ go: { type: "click", key: "Enter" } })).toEqual(INVALID);
    expect(refused({ go: { type: "keydown", key: "" } })).toEqual(INVALID);
    expect(refused({ go: { type: "keydown", key: "x".repeat(33) } })).toEqual(INVALID);
    expect(refused({ go: { type: "keyup", key: "Escape" } })).toEqual({ client: "realized", server: "realized" });
  });
});

describe("events made by different keys on one DOM event type", () => {
  const field: WebPrimitives = {
    field: { element: "input", events: { submit: { type: "keydown", key: "Enter" }, cancel: { type: "keydown", key: "Escape" } } },
  };

  it("are each reported for their own key, and a third key is neither", () => {
    const { window, container } = dom();
    const { calls, report } = reports();

    createWebPort({ container, primitives: field, report }).draw(tree(node(1, "field", {}, [], { submit: handler(1), cancel: handler(2) })));

    const input = container.firstElementChild!;

    press(container, window as never, input, "Enter");
    press(container, window as never, input, "Escape");
    press(container, window as never, input, "Tab");
    expect(calls).toEqual([[handler(1)], [handler(2)]]);
  });

  it("an event with no handler here lets the interaction go on toward the root, as before", () => {
    const { window, container } = dom();
    const { calls, report } = reports();

    createWebPort({ container, primitives: { ...field, form: { element: "div", events: { anyKey: { type: "keydown" } } } }, report }).draw(
      tree(node(1, "form", {}, [node(2, "field", {}, [], { cancel: handler(2) })], { anyKey: handler(1) })),
    );

    press(container, window as never, container.firstElementChild!.firstElementChild!, "Enter"); // the field has no `submit` handler: the form's anyKey takes it
    expect(calls).toEqual([[handler(1)]]);
  });

  it("are refused when the same key would make both, or when one of them takes any key", () => {
    const { container } = dom();
    const make = (events: WebPrimitives[string]["events"]) => () => createWebPort({ container, primitives: { field: { element: "input", events } }, report: () => undefined });

    expect(make({ a: { type: "keydown", key: "Enter" }, b: { type: "keydown", key: "Enter" } })).toThrow(/two applicable events/);
    expect(make({ a: { type: "keydown", key: "Enter" }, b: { type: "keydown" } })).toThrow(/two applicable events/);
    expect(make({ a: { type: "keydown" }, b: { type: "keydown", key: "Escape" } })).toThrow(/two applicable events/);
    expect(make({ a: { type: "keydown", key: "Enter" }, b: { type: "keyup", key: "Enter" } })).not.toThrow();
  });
});
