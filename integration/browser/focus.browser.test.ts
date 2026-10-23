// Focus follows identity, in Chromium (I2, I12): the browser itself drops focus from an element that is moved, and the PORT puts it back.
// Hand-written render trees: nothing here is MESH's or NEXUS's.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { controlled, createWebPort, type WebPrimitives } from "@valancex/port-web";
import { afterEach, describe, expect, it } from "vitest";

const primitives: WebPrimitives = {
  page: { element: "section" },
  row: { element: "button" },
  field: { element: "input", attributes: { type: "text" }, props: { value: controlled("value") } },
};

const key = (n: number): string => `k${String(n).padStart(22, "A")}`;
const row = (n: number, label: string): RenderNode => ({ type: "node", key: key(n), component: "row", props: {}, events: {}, children: [{ type: "text", key: key(n + 100), text: label }] });
const field = (n: number, value: string): RenderNode => ({ type: "node", key: key(n), component: "field", props: { value }, events: {}, children: [] });
const page = (...children: RenderNode[]): RenderTree => ({ format: "mesh-render", version: 1, root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children } });

const containers: HTMLElement[] = [];
const mount = () => {
  const container = document.createElement("main");
  document.body.append(container);
  containers.push(container);

  return { container, port: createWebPort({ container, primitives, report: () => {} }) };
};

afterEach(() => containers.splice(0).forEach((each) => each.remove()));

describe("in Chromium", () => {
  it("a moved row keeps focus", () => {
    const { container, port } = mount();
    port.draw(page(row(11, "A"), row(12, "B"), row(13, "C")));
    container.querySelectorAll("button")[1]!.focus();

    port.update(page(row(12, "B"), row(11, "A"), row(13, "C")));
    expect(document.activeElement?.textContent).toBe("B");
    port.update(page(row(13, "C"), row(12, "B"), row(11, "A")));
    expect(document.activeElement?.textContent).toBe("B");
  });

  it("a moved text field keeps focus and its selection", () => {
    const { container, port } = mount();
    port.draw(page(row(11, "A"), field(12, "hello world")));
    const input = container.querySelector("input")!;
    input.focus();
    input.setSelectionRange(2, 7, "backward");

    port.update(page(field(12, "hello world"), row(11, "A")));

    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 7, "backward"]);
  });

  it("a removed row hands focus to the one after it, else the one before", () => {
    const { container, port } = mount();
    port.draw(page(row(11, "A"), row(12, "B"), row(13, "C")));
    container.querySelectorAll("button")[1]!.focus();
    port.update(page(row(11, "A"), row(13, "C")));
    expect(document.activeElement?.textContent).toBe("C");
    port.update(page(row(11, "A")));
    expect(document.activeElement?.textContent).toBe("A");
  });

  it("focus(key) focuses the part and says so", () => {
    const { container, port } = mount();
    port.draw(page(row(11, "A"), field(12, "")));

    expect(port.focus(key(12))).toBe(true);
    expect(document.activeElement).toBe(container.querySelector("input"));
    expect(port.focus(key(99))).toBe(false);
  });
});
