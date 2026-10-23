// Layers (decisions I4 to I8): what the table says, what the server writes, what hydration verifies. What the browser does with them (the top layer, focus, Escape) is in Chromium, in
// integration/browser: jsdom has no top layer.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { attribute, createWebPort, layerDismiss, layerProp, WebRealizationError, type WebPrimitives } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, key, node, reports, text, tree } from "./support.js";
import { parse } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  button: { element: "button", props: { id: attribute("id") }, events: { click: { type: "click" } } },
  dialog: { element: "dialog", layer: "modal", props: { open: layerProp("open"), label: attribute("aria-label") }, events: { dismiss: layerDismiss } },
  popover: {
    element: "div",
    layer: "popover",
    props: { open: layerProp("open"), anchor: layerProp("anchor"), placement: layerProp("placement"), mode: attribute("popover") },
    events: { dismiss: layerDismiss },
  },
};

const withText = (n: number, props: Record<string, string | boolean>, children: ReadonlyArray<RenderNode> = []): RenderNode => ({
  ...node(n, "x", props, children),
  propText: Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === "boolean").map(([k, v]) => [k, String(v)])),
});
const as = (component: string, n: number, props: Record<string, string | boolean>, children: ReadonlyArray<RenderNode> = []): RenderNode => ({ ...withText(n, props, children), component });
const page = (...children: RenderNode[]): RenderTree => tree(node(1, "page", {}, children));
const inside = (): RenderNode[] => [node(5, "button", { id: "go" }, [text(105, "go")])];

const refuse = (table: WebPrimitives): string | undefined => {
  try {
    createWebPort({ container: dom().container, primitives: table, report: () => {} });
  } catch (error) {
    return (error as WebRealizationError).code;
  }

  return undefined;
};

describe("a layer's table", () => {
  it("is refused when it has no way to be open, claims two, is a modal that is not a dialog or is anchored, or raises an event it is not a layer for", () => {
    expect(refuse({ d: { element: "dialog", layer: "modal", props: { label: attribute("aria-label") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "dialog", layer: "modal", props: { a: layerProp("open"), b: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", layer: "modal", props: { open: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "dialog", layer: "modal", props: { open: layerProp("open"), anchor: layerProp("anchor") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", props: { open: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", events: { dismiss: layerDismiss } } })).toBe("invalid-primitives");
    expect(refuse({ d: { element: "div", layer: "popover", attributes: { popover: "auto" }, props: { open: layerProp("open") } } })).toBe("invalid-primitives");
    expect(refuse(primitives)).toBeUndefined();
  });

  it("refuses a value that is not what its role holds", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });

    expect(() => port.draw(page(as("dialog", 2, { open: "yes" })))).toThrow(WebRealizationError);
    expect(() => port.draw(page(as("popover", 2, { open: true, anchor: true as never })))).toThrow(WebRealizationError);
  });
});

describe("one modal at a time (decision I29)", () => {
  const nested = (): RenderTree => page(as("dialog", 2, { open: true, label: "Outer" }, [as("dialog", 3, { open: true, label: "Inner" }, inside())]));
  const codeOf = (run: () => unknown): { code: string; message: string } | undefined => {
    try {
      run();
    } catch (error) {
      return { code: (error as WebRealizationError).code, message: (error as Error).message };
    }

    return undefined;
  };

  it("a dialog inside a dialog is refused by draw, update and the server with a message that names both, and nothing is drawn", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });
    const refused = codeOf(() => port.draw(nested()));

    expect(refused?.code).toBe("nested-modal");
    expect(refused?.message).toContain("<dialog> is a modal layer inside <dialog>");
    expect(container.innerHTML).toBe("");
    expect(codeOf(() => realizeHtml(nested(), primitives))?.code).toBe("nested-modal");

    port.draw(page(as("dialog", 2, { open: true, label: "Outer" }, inside())));
    expect(codeOf(() => port.update(nested()))?.code).toBe("nested-modal");
  });

  it("is found however deep, and a patch that inserts the inner dialog is refused too", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });
    const deep = page(as("dialog", 2, { open: true, label: "Outer" }, [node(6, "page", {}, [as("dialog", 3, { open: true, label: "Inner" })])]));

    expect(codeOf(() => port.draw(deep))?.code).toBe("nested-modal");

    port.draw(page(as("dialog", 2, { open: true, label: "Outer" }, inside())));
    expect(
      codeOf(() =>
        port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: key(2), node: as("dialog", 3, { open: true, label: "Inner" }) }] } as never),
      ),
    ).toMatchObject({ code: "nested-modal" });
  });

  it("dialogs side by side, and a popover inside a dialog, are fine", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });

    expect(codeOf(() => port.draw(page(as("dialog", 2, { open: false, label: "A" }, [as("popover", 4, { open: false })]), as("dialog", 3, { open: false, label: "B" }))))).toBeUndefined();
  });
});

describe("what the server writes for a layer", () => {
  it("an open dialog is written open, so that it paints; a closed one is not", () => {
    expect(realizeHtml(page(as("dialog", 2, { open: true, label: "Sure?" }, inside())), primitives)).toContain("<dialog aria-label=\"Sure?\" open>");
    expect(realizeHtml(page(as("dialog", 2, { open: false, label: "Sure?" }, inside())), primitives)).toContain("<dialog aria-label=\"Sure?\">");
  });

  it("a popover is written with the mode it has: its prop's, else auto", () => {
    expect(realizeHtml(page(as("popover", 2, { open: true })), primitives)).toContain('<div popover="auto">');
    expect(realizeHtml(page(as("popover", 2, { open: true, mode: "manual" })), primitives)).toContain('<div popover="manual">');
  });
});

describe("hydrating a layer", () => {
  const open = (): RenderTree => page(as("dialog", 2, { open: true, label: "Sure?" }, inside()), as("popover", 3, { open: false, mode: "manual" }));

  it("adopts what the server wrote", () => {
    const { container } = parse(realizeHtml(open(), primitives));

    expect(createWebPort({ container, primitives, report: () => {} }).hydrate(open())).toEqual({ adopted: true });
  });

  it("does not adopt a dialog the server wrote closed for a tree that has it open, or a popover with another mode", () => {
    const closed = realizeHtml(page(as("dialog", 2, { open: false, label: "Sure?" }, inside()), as("popover", 3, { open: false, mode: "manual" })), primitives);

    expect(createWebPort({ container: parse(closed).container, primitives, report: () => {} }).hydrate(open()).adopted).toBe(false);

    const other = realizeHtml(page(as("dialog", 2, { open: true, label: "Sure?" }, inside()), as("popover", 3, { open: false, mode: "auto" })), primitives);

    expect(createWebPort({ container: parse(other).container, primitives, report: () => {} }).hydrate(open()).adopted).toBe(false);
  });
});

describe("a layer without a top layer to show it in", () => {
  it("is open by its attribute while the application has it open, and its popover has the mode it has", () => {
    const { container } = dom();
    const { calls, report } = reports();
    const port = createWebPort({ container, primitives, report });

    port.draw(page(as("dialog", 2, { open: true, label: "Sure?" }, inside()), as("popover", 3, { open: false })));
    expect(container.querySelector("dialog")!.hasAttribute("open")).toBe(true);
    expect(container.querySelector("div[popover]")!.getAttribute("popover")).toBe("auto");

    port.update(page(as("dialog", 2, { open: false, label: "Sure?" }, inside()), as("popover", 3, { open: false, mode: "manual" })));
    expect(container.querySelector("dialog")!.hasAttribute("open")).toBe(false);
    expect(container.querySelector("div[popover]")!.getAttribute("popover")).toBe("manual");
    expect(calls).toEqual([]);
  });
});
