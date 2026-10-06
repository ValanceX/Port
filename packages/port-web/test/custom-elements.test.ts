// Web Components as primitives. A custom element is a primitives-table entry
// like any element: its props are DOM properties (a list or record has no
// text, so only a property can hold it, MESH §9.8.7), its events are DOM
// events with a payload hook. These tests use a real autonomous custom
// element in a DOM of the test's own, and hold the Web PORT to what it
// promises: properties written before the element is connected, the same
// element object across update and patch, and one report per interaction.
import type { BoundaryValue } from "@valancex/mesh-runtime";

import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { WebRealizationError, createWebPort, property, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { handler, key, node, reports, text, tree } from "./support.js";

const world = () => {
  const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>");
  const seenAtConnect: unknown[] = [];

  // An autonomous custom element with a rich property and an event.
  class MyChart extends window.HTMLElement {
    #points: unknown = undefined;
    writes = 0;

    get points(): unknown { return this.#points; }

    set points(value: unknown) { this.#points = value; this.writes += 1; }

    connectedCallback(): void { seenAtConnect.push(this.#points); }
  }

  window.customElements.define("my-chart", MyChart as unknown as CustomElementConstructor);

  const container = window.document.querySelector("main")!;
  const { calls, report } = reports();
  const primitives = {
    chart: {
      element: "my-chart",
      props: { points: property("points", "value"), caption: textProperty("title") },
      events: { select: { type: "point-selected", payload: (event: Event): BoundaryValue => (event as CustomEvent<BoundaryValue>).detail } },
    },
    page: { element: "section" },
  };

  return { window, container, calls, seenAtConnect, port: createWebPort({ container, primitives, report }), primitives };
};

const chart = (points: BoundaryValue, extra: Readonly<Record<string, BoundaryValue>> = {}) =>
  tree(node(1, "page", {}, [node(2, "chart", { points, ...extra }, [text(3, "fallback")], { select: handler(2) })]));

describe("a custom element as a primitive", () => {
  it("receives a list or a record natively, as a DOM property, before it is connected", () => {
    const { container, port, seenAtConnect } = world();
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    port.draw(chart(points));

    const element = container.querySelector("my-chart") as unknown as { points: unknown };
    expect(element.points).toEqual(points);
    expect(seenAtConnect).toEqual([points]);
  });

  it("keeps the same element, and its own state, across update and patch", () => {
    const { container, port } = world();
    port.draw(chart([1]));
    const element = container.querySelector("my-chart") as unknown as { points: unknown; writes: number };
    element.writes = 0;

    port.update(chart([1, 2]));
    expect(container.querySelector("my-chart")).toBe(element);
    expect(element.points).toEqual([1, 2]);

    const touched = port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: key(2), prop: "points", value: { series: [1, 2, 3] } }] });
    expect(container.querySelector("my-chart")).toBe(element);
    expect(element.points).toEqual({ series: [1, 2, 3] });
    expect(touched).toEqual([key(2)]);
    expect(element.writes).toBe(2);
  });

  it("an unchanged value is not written again, and a prop that becomes absent restores the property's initial value", () => {
    const { container, port } = world();
    port.draw(chart([1]));
    const element = container.querySelector("my-chart") as unknown as { points: unknown; writes: number };
    element.writes = 0;

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: key(2), prop: "points", value: [1] }] });
    expect(element.writes).toBe(0);

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "removeProp", key: key(2), prop: "points" }] });
    expect(element.points).toBeUndefined();
  });

  it("reports a custom event once, with the payload hook's plain data", () => {
    const { window, container, port, calls } = world();
    port.draw(chart([1]));

    container.querySelector("my-chart")!.dispatchEvent(new window.CustomEvent("point-selected", { detail: { index: 2 }, bubbles: true, composed: true }));
    expect(calls).toEqual([[handler(2), { index: 2 }]]);
  });

  it("a list can't go in a text-only slot, and the refusal changes nothing", () => {
    const { container, port } = world();
    port.draw(chart([1]));
    const html = container.innerHTML;

    expect(() => port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: key(2), prop: "caption", value: [1] }] }))
      .toThrowError(expect.objectContaining({ code: "unrealizable-value" }));
    expect(container.innerHTML).toBe(html);
  });

  it("a rich property has no HTML form, so the server refuses it, and the element is client-only", () => {
    const { primitives } = world();

    expect(() => realizeHtml(chart([1]), primitives)).toThrowError(WebRealizationError);
    expect(() => realizeHtml(chart([1]), primitives)).toThrowError(expect.objectContaining({ code: "unserializable-prop" }));
  });

  it("inserted custom elements are realized like drawn ones, and can be found by key", () => {
    const { container, port } = world();
    port.draw(tree(node(1, "page", {}, [])));
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(1), node: node(5, "chart", { points: [7] }) }] });

    const element = container.querySelector("my-chart") as unknown as { points: unknown };
    expect(element.points).toEqual([7]);
    expect(port.inspect(key(5))).toBe(element);
    expect(port.inspect(key(99))).toBeUndefined();
  });
});
