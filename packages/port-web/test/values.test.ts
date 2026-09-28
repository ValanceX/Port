// Value realization (MESH §9.8.7) in each of the Web PORT's slot classes:
// text-only slots take a string's own value or MESH's `propText`, native
// slots take a value of their own kind unchanged, and anything else is
// refused. The PORT never makes a value's text. MESH's own value cases run
// in conformance.test.ts.
import type { BoundaryValue, RenderNode } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort, property, textProperty } from "../src/index.js";

import { dom, key } from "./support.js";

const primitives = {
  field: {
    element: "input",
    props: {
      label: attribute("aria-label"),
      value: textProperty("value"),
      checked: property("checked", "boolean"),
      disabled: booleanAttribute("disabled"),
    },
  },
  meter: { element: "progress", props: { amount: property("value", "number"), hint: attribute("title") } },
  widget: { element: "valance-widget", props: { data: property("data", "value") } },
};

/** A node as MESH gives it: `propText` present only when some prop has an entry. */
const one = (component: string, props: Readonly<Record<string, BoundaryValue>>, propText?: Readonly<Record<string, string>>): RenderNode =>
  ({ type: "node", key: key(1), component, props, ...(propText === undefined ? {} : { propText }), events: {}, children: [] });

const drawn = (component: string, props: Readonly<Record<string, BoundaryValue>>, propText?: Readonly<Record<string, string>>) => {
  const { container } = dom();
  const port = createWebPort({ container, primitives, report: () => {} });
  port.draw({ format: "mesh-render", version: 1, root: one(component, props, propText) });

  return { port, element: container.firstChild as Element & Record<string, unknown> };
};

const refusal = (component: string, props: Readonly<Record<string, BoundaryValue>>, propText?: Readonly<Record<string, string>>) => {
  const { container } = dom();
  const port = createWebPort({ container, primitives, report: () => {} });

  try {
    port.draw({ format: "mesh-render", version: 1, root: one(component, props, propText) });
  } catch (error) {
    expect(container.childNodes).toHaveLength(0);

    return (error as { readonly code: string }).code;
  }

  return "realized";
};

describe("text-only slots: an attribute", () => {
  it("takes a string as given", () => {
    expect(drawn("meter", { hint: "a < b & \"c\"" }).element.getAttribute("title")).toBe("a < b & \"c\"");
  });

  it("takes MESH's propText for a number, a boolean and null, exactly as given", () => {
    // The texts are deliberately not what any formatter would make: the PORT copies, and never converts.
    for (const [value, text] of [[42, "forty-two"], [1e21, "1e+21"], [true, "yes, MESH says"], [false, "false"], [null, "null"]] as const) {
      expect(drawn("meter", { hint: value }, { hint: text }).element.getAttribute("title")).toBe(text);
    }
  });

  it("uses a string's own value even if a propText entry were present", () => {
    expect(drawn("meter", { hint: "own" }, { hint: "copy" }).element.getAttribute("title")).toBe("own");
  });

  it("refuses a number, boolean or null with no propText: the PORT never makes MESH text", () => {
    for (const value of [42, true, false, null]) {
      expect(refusal("meter", { hint: value })).toBe("missing-prop-text");
      expect(refusal("meter", { hint: value }, { other: "x" })).toBe("missing-prop-text");
    }
  });

  it("refuses a list or a record: they have no MESH text", () => {
    expect(refusal("meter", { hint: ["a", "b"] })).toBe("unrealizable-value");
    expect(refusal("meter", { hint: { a: "b" } })).toBe("unrealizable-value");
  });

  it("omits an absent prop, and keeps null, whose text is null, distinct from it", () => {
    expect(drawn("meter", {}).element.hasAttribute("title")).toBe(false);
    expect(drawn("meter", { hint: null }, { hint: "null" }).element.getAttribute("title")).toBe("null");
  });
});

describe("text-only slots: a DOMString property", () => {
  it("takes a string as given, and MESH's propText for a number, boolean or null", () => {
    expect(drawn("field", { value: "typed" }).element.value).toBe("typed");
    expect(drawn("field", { value: 0.30000000000000004 }, { value: "0.30000000000000004" }).element.value).toBe("0.30000000000000004");
    expect(drawn("field", { value: null }, { value: "null" }).element.value).toBe("null");
  });

  it("refuses what it can't hold as text", () => {
    expect(refusal("field", { value: 3 })).toBe("missing-prop-text");
    expect(refusal("field", { value: [3] })).toBe("unrealizable-value");
  });

  it("leaves the element's own initial value for an absent prop, and returns to it when the prop goes away", () => {
    const { port, element } = drawn("field", { value: "typed" });

    port.update({ format: "mesh-render", version: 1, root: one("field", {}) });

    expect(element.value).toBe("");
    expect(drawn("field", {}).element.value).toBe("");
  });
});

describe("native slots", () => {
  it("a boolean attribute holds a boolean by presence", () => {
    expect(drawn("field", { disabled: true }).element.getAttribute("disabled")).toBe("");
    expect(drawn("field", { disabled: false }).element.hasAttribute("disabled")).toBe(false);
    expect(refusal("field", { disabled: "true" })).toBe("unrealizable-value");
    // A propText entry doesn't make a text of a native slot's value.
    expect(refusal("field", { disabled: null }, { disabled: "null" })).toBe("unrealizable-value");
  });

  it("a boolean property takes a boolean natively, and nothing else", () => {
    const { element } = drawn("field", { checked: true });

    expect(element.checked).toBe(true);
    expect(refusal("field", { checked: "true" })).toBe("unrealizable-value");
    expect(refusal("field", { checked: 1 }, { checked: "1" })).toBe("unrealizable-value");
  });

  it("a number property (an IDL double) takes the binary64 value itself, with no text", () => {
    const { element } = drawn("meter", { amount: 0.30000000000000004 }, { amount: "0.30000000000000004" });

    expect(element.value).toBe(0.30000000000000004);
    expect(refusal("meter", { amount: "0.3" })).toBe("unrealizable-value");
    expect(refusal("meter", { amount: null }, { amount: "null" })).toBe("unrealizable-value");
  });

  it("a value property takes lists, records and null unchanged", () => {
    for (const value of [["a", 1], { x: 1.5, y: -2 }, null] as const) {
      expect(drawn("widget", { data: value }).element.data).toBe(value);
    }
  });

  it("an absent prop leaves a property at the element's own initial value", () => {
    const { port, element } = drawn("meter", { amount: 0.5 }, { amount: "0.5" });

    port.update({ format: "mesh-render", version: 1, root: one("meter", {}) });

    expect(element.value).toBe(0);
  });
});

describe("updates realize by the same rule", () => {
  it("a propText change is written; an unchanged value isn't", () => {
    const { port, element } = drawn("meter", { hint: 1 }, { hint: "1" });
    let writes = 0;
    const set = element.setAttribute.bind(element);
    element.setAttribute = (name: string, value: string) => { writes += 1; set(name, value); };

    port.update({ format: "mesh-render", version: 1, root: one("meter", { hint: 1 }, { hint: "1" }) });
    expect(writes).toBe(0);

    port.update({ format: "mesh-render", version: 1, root: one("meter", { hint: 2 }, { hint: "2" }) });
    expect(element.getAttribute("title")).toBe("2");
    expect(writes).toBe(1);
  });

  it("an update with a value its slot can't hold changes nothing", () => {
    const { port, element } = drawn("meter", { hint: "kept" });

    expect(() => port.update({ format: "mesh-render", version: 1, root: one("meter", { hint: 9 }) })).toThrow(expect.objectContaining({ code: "missing-prop-text" }));
    expect(element.getAttribute("title")).toBe("kept");
  });
});
