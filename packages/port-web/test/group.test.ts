// The DOM's own grouping: radios of one radiogroup carry one `name`, which is what gives them one tab stop and the arrow keys (the browser's default action; the Chromium case is in
// integration/browser). The name is the PORT's, never the tree's: two groups, or two mounts of one tree in one document, never share one; the server writes the group's key, and hydration adopts it.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { describe, expect, it } from "vitest";

import { attribute, controlledBoolean, createWebPort, WebRealizationError, type WebPrimitives } from "../src/index.js";
import { realizeHtml } from "../src/server.js";

import { dom, node, reports, tree } from "./support.js";
import { parse } from "./ssr-support.js";

const primitives: WebPrimitives = {
  page: { element: "section" },
  radiogroup: { element: "div", attributes: { role: "radiogroup" } },
  radio: { element: "input", attributes: { type: "radio" }, props: { checked: controlledBoolean("checked"), value: attribute("value") }, group: { within: "radiogroup", attribute: "name" } },
};

const radio = (n: number, value: string, checked = false): RenderNode => node(n, "radio", { checked, value });
const two = (): RenderTree =>
  tree(node(1, "page", {}, [node(2, "radiogroup", {}, [radio(3, "s", true), radio(4, "m")]), node(5, "radiogroup", {}, [radio(6, "a"), radio(7, "b")]), radio(8, "stray")]));

const names = (container: Element): ReadonlyArray<string | null> => Array.from(container.querySelectorAll("input"), (input) => input.getAttribute("name"));

describe("a radio's group", () => {
  it("is its radiogroup: one name in a group, another in the next, none outside a group", () => {
    const { container } = dom();
    createWebPort({ container, primitives, report: () => {} }).draw(two());
    const [s, m, a, b, stray] = names(container);

    expect(s).toBe(m);
    expect(a).toBe(b);
    expect(s).not.toBe(a);
    expect(s).toBeTruthy();
    expect(stray).toBeNull();
  });

  it("is made to the mount: two mounts of one tree in one document share no group", () => {
    const { window, container } = dom();
    const other = window.document.createElement("main");
    window.document.body.append(other);
    createWebPort({ container, primitives, report: () => {} }).draw(two());
    createWebPort({ container: other, primitives, report: () => {} }).draw(two());

    const first = new Set(names(container).filter((each) => each !== null));
    const second = new Set(names(other).filter((each) => each !== null));

    expect([...first].filter((each) => second.has(each))).toEqual([]);
    // and the browser's own grouping agrees: checking one radio of the second mount leaves the first mount's checked radio alone
    (other.querySelectorAll("input")[1] as HTMLInputElement).checked = true;
    expect((container.querySelectorAll("input")[0] as HTMLInputElement).checked).toBe(true);
    expect((other.querySelectorAll("input")[0] as HTMLInputElement).checked).toBe(false);
  });

  it("is given to a radio inserted later, in its group", () => {
    const { container } = dom();
    const port = createWebPort({ container, primitives, report: () => {} });
    port.draw(two());
    port.patch({ format: "mesh-render-patch", version: 1, patches: [{ op: "insert", parent: node(2, "radiogroup").key, node: radio(9, "l") }] });
    const [s, , added] = names(container);

    expect(added).toBe(s);
  });

  it("is written by the server as the group's key, and hydration adopts it: the first mount keeps it, a later one makes it its own", () => {
    const html = realizeHtml(two(), primitives);
    const { container, window } = parse(html);

    expect(names(container).slice(0, 2)).toEqual([node(2, "radiogroup").key, node(2, "radiogroup").key]);

    const { calls, report } = reports();
    const result = createWebPort({ container, primitives, report }).hydrate(two());

    expect(result).toEqual({ adopted: true });
    expect(names(container)[0]).toBe(node(2, "radiogroup").key);

    const later = window.document.createElement("main");
    later.innerHTML = html;
    window.document.body.append(later);

    expect(createWebPort({ container: later, primitives, report }).hydrate(two())).toEqual({ adopted: true });
    expect(names(later)[0]).not.toBe(node(2, "radiogroup").key);
    expect(names(later)[0]).toBe(names(later)[1]);
    expect(calls).toEqual([]);
  });

  it("is verified by hydration: a server name that is not the group's key is a mismatch", () => {
    const html = realizeHtml(two(), primitives).replace(`name="${node(2, "radiogroup").key}"`, 'name="other"');
    const { container } = parse(html);
    const result = createWebPort({ container, primitives, report: () => {} }).hydrate(two());

    expect(result.adopted).toBe(false);
  });

  it("is refused in a table that claims its attribute twice or names no group", () => {
    const refuse = (table: WebPrimitives) => {
      try {
        createWebPort({ container: dom().container, primitives: table, report: () => {} });
      } catch (error) {
        return (error as WebRealizationError).code;
      }

      return undefined;
    };

    expect(refuse({ radio: { ...primitives.radio!, attributes: { type: "radio", name: "x" } } })).toBe("invalid-primitives");
    expect(refuse({ radio: { ...primitives.radio!, props: { name: attribute("name") } } })).toBe("invalid-primitives");
    expect(refuse({ radio: { ...primitives.radio!, group: { within: "", attribute: "name" } } })).toBe("invalid-primitives");
    expect(refuse({ radio: { ...primitives.radio!, group: { within: "radiogroup", attribute: "Name" } } })).toBe("invalid-primitives");
    expect(refuse({ radio: { ...primitives.radio!, group: { within: "radiogroup", attribute: "onclick" } } })).toBe("invalid-primitives");
  });
});
