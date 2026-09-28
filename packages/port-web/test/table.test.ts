// Realization-table validation (docs/superpowers/specs/2026-09-28-port-web-ssr.md
// §4.7), shared by the client and the server: a table either side refuses,
// both refuse, with `invalid-primitives`, before anything is realized.
import type { PropRealization, WebPrimitives } from "../src/index.js";

import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort, property, textProperty } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, key } from "./support.js";

const leaf = (component: string) => ({ format: "mesh-render", version: 1, root: { type: "node", key: key(1), component, props: {}, events: {}, children: [] } }) as const;

/** Whether each side refuses `primitives` as an invalid table. */
const refusedBy = (primitives: WebPrimitives, component = "p") => {
  const client = (() => {
    try {
      createWebPort({ container: dom().container, primitives, report: () => {} }).draw(leaf(component));
    } catch (error) {
      return (error as { readonly code?: string }).code;
    }

    return "accepted";
  })();

  const server = (() => {
    try {
      realizeHtml(leaf(component), primitives);
    } catch (error) {
      return (error as { readonly code?: string }).code;
    }

    return "accepted";
  })();

  return { client, server };
};

const INVALID = { client: "invalid-primitives", server: "invalid-primitives" };

describe("a source prop has at most one realization within a primitive", () => {
  it("can't be written twice: a table literal with one prop mapped twice doesn't typecheck", () => {
    const table: WebPrimitives = {
      // @ts-expect-error TS1117: `value` → attribute and `value` → textProperty is not a table.
      p: { element: "input", props: { value: attribute("value"), value: textProperty("value") } },
    };

    // What a JavaScript engine makes of it anyway: one entry, never two.
    expect(Object.keys(table["p"]!.props!)).toEqual(["value"]);
  });

  it("refuses an entry that could give one prop competing realizations: an accessor", () => {
    const props: Record<string, PropRealization> = {};
    let reads = 0;
    Object.defineProperty(props, "value", { enumerable: true, get: () => (reads++ % 2 === 0 ? attribute("value") : textProperty("value")) });

    expect(refusedBy({ p: { element: "input", props } })).toEqual(INVALID);
  });

  it("refuses an entry that isn't a realization of a known kind", () => {
    for (const bad of [{ kind: "style", name: "color" }, { kind: "property", name: "x", holds: "string" }, null, "value"]) {
      expect(refusedBy({ p: { element: "div", props: { value: bad as unknown as PropRealization } } })).toEqual(INVALID);
    }
  });

  it("accepts one realization per prop, of any of the four kinds", () => {
    expect(refusedBy({
      p: { element: "input", props: { a: attribute("aria-label"), b: textProperty("value"), c: booleanAttribute("disabled"), d: property("checked", "boolean") } },
    })).toEqual({ client: "accepted", server: "accepted" });
  });
});

describe("destination names", () => {
  it("refuses two props realized as one attribute, across attribute and boolean attribute", () => {
    expect(refusedBy({ p: { element: "div", props: { a: attribute("title"), b: attribute("title") } } })).toEqual(INVALID);
    expect(refusedBy({ p: { element: "div", props: { a: attribute("hidden"), b: booleanAttribute("hidden") } } })).toEqual(INVALID);
  });

  it("refuses two props realized as one property, across property and text property", () => {
    expect(refusedBy({ p: { element: "input", props: { a: textProperty("value"), b: property("value", "value") } } })).toEqual(INVALID);
  });

  it("reserves data-component for the unknown-component placeholder", () => {
    expect(refusedBy({ p: { element: "div", props: { a: attribute("data-component") } } })).toEqual(INVALID);
  });

  it("refuses element and attribute names that don't round-trip through HTML and the DOM alike", () => {
    for (const element of ["Div", "my element", "1x", ""]) {
      expect(refusedBy({ p: { element } })).toEqual(INVALID);
    }

    for (const name of ["Title", "a b", "x=y", "\"q", ""]) {
      expect(refusedBy({ p: { element: "div", props: { a: attribute(name) } } })).toEqual(INVALID);
    }
  });
});

describe("events", () => {
  it("refuses one DOM event type constituting two events of one primitive, on both sides", () => {
    expect(refusedBy({ p: { element: "button", events: { click: { type: "click" }, press: { type: "click" } } } })).toEqual(INVALID);
  });
});
