// Radios in Chromium: one `name` per radiogroup gives the platform's own keyboard behavior, which jsdom does not run: one tab stop for the group, and the arrow keys moving
// focus and the choice among its radios. Two mounts of one tree in one document keep separate groups.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { attribute, controlledBoolean, createWebPort, type WebPrimitives } from "@valancex/port-web";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

const primitives: WebPrimitives = {
  page: { element: "section" },
  radiogroup: { element: "div", attributes: { role: "radiogroup" } },
  radio: {
    element: "input",
    attributes: { type: "radio" },
    props: { checked: controlledBoolean("checked"), value: attribute("value") },
    events: { select: { type: "change", payload: (_event, element) => (element as HTMLInputElement).value } },
    group: { within: "radiogroup", attribute: "name" },
  },
  button: { element: "button" },
};

const key = (n: number): string => `k${String(n).padStart(22, "A")}`;
const radio = (n: number, value: string, checked = false): RenderNode => ({ type: "node", key: key(n), component: "radio", props: { checked, value }, events: { select: `hAAAAAAAAAAA.${String(n).padStart(22, "A")}` }, children: [] });
const group = (n: number, ...radios: RenderNode[]): RenderNode => ({ type: "node", key: key(n), component: "radiogroup", props: {}, events: {}, children: radios });
const button = (n: number): RenderNode => ({ type: "node", key: key(n), component: "button", props: {}, events: {}, children: [{ type: "text", key: key(n + 100), text: "after" }] });
const page = (...children: RenderNode[]): RenderTree => ({ format: "mesh-render", version: 1, root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children } });

const containers: HTMLElement[] = [];
const mount = (tree: RenderTree, reports: unknown[] = []) => {
  const container = document.createElement("main");
  document.body.append(container);
  containers.push(container);
  createWebPort({ container, primitives, report: (_handler, payload) => void reports.push(payload) }).draw(tree);

  return container;
};

const where = (): string => {
  const active = document.activeElement as HTMLInputElement | null;

  return active === null || active === document.body ? "nothing" : active.localName === "input" ? active.value : active.localName;
};

afterEach(() => containers.splice(0).forEach((each) => each.remove()));

describe("radios in Chromium", () => {
  it("the group is one tab stop, and the arrow keys move focus and the choice", async () => {
    const reports: unknown[] = [];
    const container = mount(page(group(2, radio(3, "s", true), radio(4, "m"), radio(5, "l")), button(6)), reports);

    await userEvent.tab();
    expect(where()).toBe("s");
    await userEvent.keyboard("{ArrowDown}");
    expect(where()).toBe("m");
    expect((container.querySelectorAll("input")[1] as HTMLInputElement).checked).toBe(true);
    expect(reports).toEqual(["m"]);
    await userEvent.keyboard("{ArrowRight}");
    expect(where()).toBe("l");
    await userEvent.keyboard("{ArrowUp}");
    expect(where()).toBe("m");
    // one tab stop: the next Tab leaves the group
    await userEvent.tab();
    expect(where()).toBe("button");
  });

  it("two groups, and two mounts of one tree, keep their own choice", async () => {
    const tree = page(group(2, radio(3, "s", true), radio(4, "m")), group(5, radio(6, "a", true), radio(7, "b")));
    const first = mount(tree);
    const second = mount(tree);

    (second.querySelectorAll("input")[1] as HTMLInputElement).checked = true;
    (first.querySelectorAll("input")[3] as HTMLInputElement).checked = true;

    expect(Array.from(first.querySelectorAll("input"), (input) => input.checked)).toEqual([true, false, false, true]);
    expect(Array.from(second.querySelectorAll("input"), (input) => input.checked)).toEqual([false, true, true, false]);
  });
});
