// The native hatch (Tier 3, Provisional, Web only; Valance north-star refinements §4, B6): `native` callbacks, by component, get a drawn element and its key, and nothing that reports
// or dispatches. Their lifetime is the element's; the PORT re-asserts what it owns on its next write; an `opaque` primitive has no tree children, and hydration leaves its contents alone.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";
import type { Native } from "../src/native.js";

import { describe, expect, it } from "vitest";

import { attribute, booleanAttribute, createWebPort, elementWhen, layerProp, property, textProperty, WebRealizationError, type WebPrimitives } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, handler, key, node, reports, text, tree } from "./support.js";
import { parse } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  chart: { element: "div", opaque: true, attributes: { role: "img" }, props: { label: attribute("aria-label"), framed: elementWhen("figure"), busy: booleanAttribute("aria-busy"), level: property("tabIndex", "number") } },
  row: { element: "button", props: { label: attribute("aria-label") }, events: { click: { type: "click" } } },
};

const chart = (n: number, props: Record<string, string | boolean> = { label: "Sales" }): RenderNode => ({
  ...node(n, "chart", props),
  propText: Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === "boolean").map(([k, v]) => [k, String(v)])),
});
const row = (n: number): RenderNode => node(n, "row", { label: `row ${n}` }, [text(n + 100, `row ${n}`)], { click: handler(n) });
const page = (...children: ReadonlyArray<RenderNode>): RenderTree => tree(node(1, "page", {}, children));

/** A port whose `chart` callback logs what happens, and puts a button of its own inside the chart. */
const setup = (extra: Native = {}) => {
  const { window, container } = dom();
  const log: string[] = [];
  const seen: Array<{ readonly element: Element; readonly args: ReadonlyArray<unknown> }> = [];
  const { calls, report } = reports();
  const native: Native = {
    chart: (...args) => {
      const [element, { key: at }] = args;
      seen.push({ element, args });
      log.push(`mount ${at} ${element.localName} connected=${element.isConnected}`);
      const own = element.ownerDocument.createElement("button");
      own.textContent = "zoom";
      element.append(own);

      return () => log.push(`cleanup ${at} ${element.localName} active=${element.ownerDocument.activeElement?.getAttribute("aria-label") ?? element.ownerDocument.activeElement?.localName}`);
    },
    ...extra,
  };
  const port = createWebPort({ container, primitives, report, native });

  return { window, container, port, log, seen, calls };
};

describe("the native callback runs after the element exists", () => {
  it("on draw: once, with the element (in the document) and { key } only", () => {
    const { port, container, log, seen } = setup();
    port.draw(page(chart(2)));

    expect(log).toEqual([`mount ${key(2)} div connected=true`]);
    expect(seen[0]!.element).toBe(port.inspect(key(2)));
    expect(seen[0]!.args).toHaveLength(2);
    expect(Object.keys(seen[0]!.args[1] as object)).toEqual(["key"]);
    expect(container.querySelector("[role=img] > button")?.textContent).toBe("zoom");
  });

  it("on insert, by update and by patch", () => {
    const { port, log } = setup();
    port.draw(page(row(5)));
    port.update(page(row(5), chart(2)));
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(1), node: chart(3) }] });

    expect(log).toEqual([`mount ${key(2)} div connected=true`, `mount ${key(3)} div connected=true`]);
  });

  it("after hydration adopts the server DOM, on the server's own element", () => {
    const html = realizeHtml(page(chart(2)), primitives);
    const { container } = parse(html);
    const server = container.querySelector("[role=img]");
    const seen: Element[] = [];
    const port = createWebPort({ container, primitives, report: () => {}, native: { chart: (element) => { seen.push(element); } } });

    expect(port.hydrate(page(chart(2)))).toEqual({ adopted: true });
    expect(seen).toEqual([server]);
  });

  it("after hydration draws afresh on a mismatch: an opaque element's wrong attribute is still verified", () => {
    const html = realizeHtml(page(chart(2)), primitives).replace('aria-label="Sales"', 'aria-label="Old"');
    const { container } = parse(html);
    const seen: Element[] = [];
    const port = createWebPort({ container, primitives, report: () => {}, native: { chart: (element) => { seen.push(element); } } });
    const result = port.hydrate(page(chart(2)));

    expect(result).toMatchObject({ adopted: false, mismatch: { class: "attribute", key: key(2) } });
    expect(seen).toEqual([port.inspect(key(2))]);
    expect(seen[0]!.getAttribute("aria-label")).toBe("Sales");
  });

  it("is refused, with invalid-primitives, for a name the table has no primitive for, or when it isn't a function", () => {
    const code = (native: Native): string | undefined => {
      try {
        createWebPort({ container: dom().container, primitives, report: () => {}, native });
      } catch (error) {
        return `${(error as WebRealizationError).code}: ${(error as Error).message}`;
      }

      return undefined;
    };

    expect(code({ chrat: () => {} })).toMatch(/^invalid-primitives: <chrat>/);
    expect(code({ chart: "no" as never })).toMatch(/^invalid-primitives: <chart>/);
    expect(code({ chart: () => {} })).toBeUndefined();
  });

  it("not for a component it doesn't name, and nothing it does is reported", () => {
    const { port, calls, log } = setup();
    port.draw(page(row(5)));
    port.update(page(row(6), chart(2)));

    expect(log).toEqual([`mount ${key(2)} div connected=true`]);
    expect(calls).toEqual([]);
  });
});

describe("its cleanup runs before what ends the element", () => {
  it("a removal, by update and by patch: once, and the callback does not run again", () => {
    const { port, log } = setup();
    port.draw(page(chart(2), chart(3), row(5)));
    port.update(page(chart(3), row(5)));
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "remove", key: key(3) }] });
    port.update(page(row(5)));

    expect(log.filter((entry) => entry.startsWith("cleanup")).map((entry) => entry.split(" ")[1])).toEqual([key(2), key(3)]);
    expect(log.filter((entry) => entry.startsWith("mount"))).toHaveLength(2);
  });

  it("a replacement: the old element's cleanup, then the callback on the new one (another component at the key, or another element)", () => {
    const { port, log } = setup();
    port.draw(page(chart(2)));
    port.update(page(chart(2, { label: "Sales", framed: true })));
    port.update(page(row(2)));

    expect(log).toEqual([
      `mount ${key(2)} div connected=true`,
      expect.stringMatching(`^cleanup ${key(2)} div`),
      `mount ${key(2)} figure connected=true`,
      expect.stringMatching(`^cleanup ${key(2)} figure`),
    ]);
  });

  it("a new element does not take the old one's callback-made content", () => {
    const { port, container } = setup();
    port.draw(page(chart(2)));
    port.update(page(chart(2, { label: "Sales", framed: true })));

    expect(container.querySelectorAll("figure > button")).toHaveLength(1);
  });

  it("a draw, and unmount", () => {
    const { port, log } = setup();
    port.draw(page(chart(2)));
    port.draw(page(chart(3)));
    port.unmount();
    port.unmount();

    expect(log.map((entry) => entry.split(" ").slice(0, 2).join(" "))).toEqual([`mount ${key(2)}`, `cleanup ${key(2)}`, `mount ${key(3)}`, `cleanup ${key(3)}`]);
  });

  it("after focus has been handed off: focus inside the removed element is already on its heir", () => {
    const { port, container, log } = setup();
    port.draw(page(chart(2), row(5)));
    (container.querySelector("[role=img] > button") as HTMLElement).focus();
    port.update(page(row(5)));

    expect(log.at(-1)).toBe(`cleanup ${key(2)} div active=row 5`);
  });

  it("a callback or cleanup that throws stops none of the others, and the first error is rethrown after", () => {
    const { container } = dom();
    const ran: string[] = [];
    const port = createWebPort({
      container,
      primitives,
      report: () => {},
      native: {
        chart: (_, { key: at }) => {
          ran.push(at);

          if (at === key(2)) {
            throw new Error("boom");
          }
        },
      },
    });

    expect(() => port.draw(page(chart(2), chart(3)))).toThrow("boom");
    expect(ran).toEqual([key(2), key(3)]);
    expect(port.inspect(key(3))).toBeDefined();
  });
});

describe("a call's own error", () => {
  it("wins over a cleanup's: patch-failed is what the call throws, and the cleanup still ran", () => {
    const { container } = dom();
    const ran: string[] = [];
    const table: WebPrimitives = { ...primitives, field: { element: "input", props: { amount: textProperty("valueAsNumber") } } };
    const port = createWebPort({ container, primitives: table, report: () => {}, native: { chart: () => () => { ran.push("cleanup"); throw new Error("cleanup threw"); } } });

    port.draw(page(chart(2), node(3, "field")));

    // Removing the chart owes its cleanup; then a DOM setter throws (a text input has no valueAsNumber to set).
    expect(() => port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "remove", key: key(2) }, { op: "setProp", key: key(3), prop: "amount", value: "x" }] })).toThrow(expect.objectContaining({ code: "patch-failed" }));
    expect(ran).toEqual(["cleanup"]);
  });
});

describe("state stays authoritative", () => {
  it("the PORT re-asserts every slot it owns on its next write, by update and by patch", () => {
    const { port } = setup({
      chart: (element) => {
        element.setAttribute("aria-label", "hacked");
        element.setAttribute("role", "presentation");
        element.setAttribute("aria-busy", "");
        (element as HTMLElement).tabIndex = 4;
        element.setAttribute("data-mine", "kept");
      },
    });
    const element = (): Element => port.inspect(key(2)) as Element;

    port.draw(page(chart(2)));
    expect(element().getAttribute("aria-label")).toBe("hacked");

    port.update(page(chart(2)));   // the same tree: nothing changed, and every owned slot is written back
    expect([element().getAttribute("aria-label"), element().getAttribute("role"), element().hasAttribute("aria-busy"), (element() as HTMLElement).tabIndex]).toEqual(["Sales", "img", false, -1]);
    expect(element().getAttribute("data-mine")).toBe("kept");   // not the PORT's

    element().setAttribute("aria-label", "again");
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(1), node: row(5) }] });
    expect(element().getAttribute("aria-label")).toBe("Sales");
  });
});

describe("an opaque primitive", () => {
  const codeOf = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return (error as WebRealizationError).code;
    }

    return undefined;
  };
  const withChild = (): RenderTree => page({ ...chart(2), children: [text(3, "inside")] });

  it("is refused when the tree gives it children, by draw, update, patch and the server, and nothing changes", () => {
    const { port, container } = setup();

    expect(codeOf(() => port.draw(withChild()))).toBe("opaque-children");
    expect(container.childNodes).toHaveLength(0);
    expect(codeOf(() => realizeHtml(withChild(), primitives))).toBe("opaque-children");

    port.draw(page(chart(2)));
    const before = container.innerHTML;

    expect(codeOf(() => port.update(withChild()))).toBe("opaque-children");
    expect(codeOf(() => port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(2), node: text(3, "inside") }] }))).toBe("opaque-children");
    expect(codeOf(() => port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(1), node: { ...chart(4), children: [row(5)] } }] }))).toBe("opaque-children");
    expect(container.innerHTML).toBe(before);
  });

  it("can't be a layer, and is `true` or absent", () => {
    const refuse = (table: WebPrimitives): string | undefined => codeOf(() => createWebPort({ container: dom().container, primitives: table, report: () => {} }));

    expect(refuse({ d: { element: "dialog", layer: "modal", opaque: true, props: { open: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", layer: "popover", opaque: true, props: { open: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", opaque: "yes" as never } })).toBe("invalid-primitives");
    expect(codeOf(() => realizeHtml(page(), { page: { element: "section" }, d: { element: "dialog", layer: "modal", opaque: true, props: { open: layerProp("open") } } }))).toBe("invalid-primitives");
    expect(refuse(primitives)).toBeUndefined();
  });

  it("is written empty by the server, and hydration skips its contents, which update then leaves alone", () => {
    const html = realizeHtml(page(chart(2), row(5)), primitives);
    expect(html).toContain('<div aria-label="Sales" role="img"></div>');

    // What the page put inside the chart before hydration (a server-side chart, a placeholder) is left in place, unverified.
    const { container } = parse(html.replace('role="img"></div>', 'role="img"><canvas></canvas>loading</div>'));
    const port = createWebPort({ container, primitives, report: () => {} });

    expect(port.hydrate(page(chart(2), row(5)))).toEqual({ adopted: true });
    expect(container.querySelector("[role=img]")!.innerHTML).toBe("<canvas></canvas>loading");

    port.update(page(chart(2, { label: "Revenue" }), row(5)));
    expect(container.querySelector("[role=img]")!.innerHTML).toBe("<canvas></canvas>loading");
  });
});
