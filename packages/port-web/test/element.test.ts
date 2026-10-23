// One list, whose element is chosen by a prop: `ordered` makes it an <ol>, otherwise a <ul> (the primitive's own). When the prop changes the PORT replaces the element; the items, which are the same
// parts, keep their DOM nodes (and so their state and their focus), the other props are realized again on the new element, and it stands where the old one stood.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { attribute, createWebPort, elementWhen, WebRealizationError, type WebPrimitives } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, handler, node, reports, text, tree } from "./support.js";
import { parse } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  list: { element: "ul", props: { ordered: elementWhen("ol"), class: attribute("class") }, events: { click: { type: "click" } } },
  listitem: { element: "li", attributes: { tabindex: "0" }, events: { click: { type: "click" } } },
  text: { element: "span" },
};

const item = (n: number, label: string): RenderNode => node(n, "listitem", {}, [text(n + 100, label)], { click: handler(n) });
const list = (props: Record<string, boolean | string>, ...items: RenderNode[]): RenderTree => {
  const propText: Record<string, string> = Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === "boolean").map(([k, v]) => [k, String(v)]));

  return tree(node(1, "page", {}, [text(9, "before"), { ...node(2, "list", props, items, { click: handler(2) }), ...(Object.keys(propText).length === 0 ? {} : { propText }) }, text(10, "after")]));
};

const setup = () => {
  const { window, container } = dom();
  const { calls, report } = reports();
  const port = createWebPort({ container, primitives, report });

  return { window, container, port, calls };
};

const tags = (container: Element): string => Array.from(container.querySelector("section")!.children, (child) => child.localName).join(",");

describe("an element chosen by a prop", () => {
  it("is the primitive's own while the prop is false or absent, and the chosen one while it is true", () => {
    const { container, port } = setup();
    port.draw(list({}, item(3, "a")));
    expect(tags(container)).toBe("ul");
    port.draw(list({ ordered: false }, item(3, "a")));
    expect(tags(container)).toBe("ul");
    port.draw(list({ ordered: true }, item(3, "a")));
    expect(tags(container)).toBe("ol");
  });

  it("is replaced when the prop changes, by update and by patch, and the items keep their DOM nodes, the place, and the other props", () => {
    const { container, port } = setup();
    port.draw(list({ ordered: false, class: "tight" }, item(3, "a"), item(4, "b")));
    const items = Array.from(container.querySelectorAll("li"));
    const before = container.querySelector("ul")!;

    port.update(list({ ordered: true, class: "tight" }, item(3, "a"), item(4, "b")));

    const after = container.querySelector("ol")!;

    expect(container.querySelector("ul")).toBeNull();
    expect(after).not.toBe(before);
    expect(after.getAttribute("class")).toBe("tight");
    expect(Array.from(after.children)).toEqual(items);
    expect(after.previousSibling?.textContent).toBe("before");
    expect(after.nextSibling?.textContent).toBe("after");

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: node(2, "list").key, prop: "ordered", value: false, propText: "false" }] });

    expect(tags(container)).toBe("ul");
    expect(container.querySelector("ul")!.getAttribute("class")).toBe("tight");
    expect(Array.from(container.querySelector("ul")!.children)).toEqual(items);

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "setProp", key: node(2, "list").key, prop: "ordered", value: true, propText: "true" }, { op: "setProp", key: node(2, "list").key, prop: "class", value: "loose" }] });
    expect(tags(container)).toBe("ol");
    expect(container.querySelector("ol")!.getAttribute("class")).toBe("loose");

    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "removeProp", key: node(2, "list").key, prop: "ordered" }] });
    expect(tags(container)).toBe("ul");
  });

  it("keeps events resolving on the new element and its items, and keeps focus in an item", () => {
    const { container, port, calls, window } = setup();
    port.draw(list({ ordered: false }, item(3, "a"), item(4, "b")));
    const second = container.querySelectorAll("li")[1] as HTMLElement;
    second.focus();

    port.update(list({ ordered: true }, item(3, "a"), item(4, "b")));

    expect(window.document.activeElement).toBe(second);
    second.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    container.querySelector("ol")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(calls.map(([id]) => id)).toEqual([handler(4), handler(2)]);
  });

  it("is written by the server as the chosen element, and hydration verifies it", () => {
    const ordered = list({ ordered: true }, item(3, "a"));
    const html = realizeHtml(ordered, primitives);

    expect(html).toContain("<ol");
    expect(html).not.toContain("<ul");

    const { container } = parse(html);

    expect(createWebPort({ container, primitives, report: () => {} }).hydrate(ordered)).toEqual({ adopted: true });
    expect(tags(container)).toBe("ol");

    const wrong = parse(realizeHtml(list({ ordered: false }, item(3, "a")), primitives));
    const result = createWebPort({ container: wrong.container, primitives, report: () => {} }).hydrate(ordered);

    expect(result.adopted).toBe(false);
    expect(tags(wrong.container)).toBe("ol");
  });

  it("refuses a value that is not a boolean, and a table that chooses the element twice or by a bad name", () => {
    const { port } = setup();

    expect(() => port.draw(tree(node(1, "list", { ordered: "yes" })))).toThrow(WebRealizationError);

    const refuse = (table: WebPrimitives) => {
      try {
        createWebPort({ container: dom().container, primitives: table, report: () => {} });
      } catch (error) {
        return (error as WebRealizationError).code;
      }

      return undefined;
    };

    expect(refuse({ list: { element: "ul", props: { a: elementWhen("ol"), b: elementWhen("menu") } } })).toBe("invalid-primitives");
    expect(refuse({ list: { element: "ul", props: { a: elementWhen("OL") } } })).toBe("invalid-primitives");
  });
});
