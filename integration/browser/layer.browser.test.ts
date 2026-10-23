// What a browser does with layers, and what the PORT does about it (decisions I4 to I8, I14): the server-rendered upgrade, a dismissal the application refuses (including the second Escape the browser
// will not let a page refuse), an outside click, a popover's two modes, its anchor, the return of focus, and the scroll lock. Real key presses and clicks, in Chromium.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { realizeHtml } from "@valancex/port-web/server";
import { attribute, createWebPort, layerDismiss, layerProp, type WebPort, type WebPrimitives } from "@valancex/port-web";
import { userEvent } from "@vitest/browser/context";
import { afterEach, describe, expect, it } from "vitest";

const primitives: WebPrimitives = {
  page: { element: "section" },
  button: { element: "button", props: { id: attribute("id") }, events: { click: { type: "click" } } },
  dialog: { element: "dialog", layer: "modal", props: { open: layerProp("open"), label: attribute("aria-label") }, events: { dismiss: layerDismiss } },
  popover: {
    element: "div",
    layer: "popover",
    props: { open: layerProp("open"), anchor: layerProp("anchor"), placement: layerProp("placement"), kind: attribute("popover") },
    events: { dismiss: layerDismiss },
  },
};

const key = (n: number): string => `k${String(n).padStart(22, "A")}`;
const text = (n: number, value: string) => ({ type: "text" as const, key: key(n), text: value });
const button = (n: number, label: string, id?: string): RenderNode => ({ type: "node", key: key(n), component: "button", props: id === undefined ? {} : { id }, events: {}, children: [text(n + 500, label)] });
const layer = (component: "dialog" | "popover", n: number, props: Record<string, string | boolean>, children: RenderNode[]): RenderNode =>
  ({ type: "node", key: key(n), component, props, propText: Object.fromEntries(Object.entries(props).filter(([, v]) => typeof v === "boolean").map(([k, v]) => [k, String(v)])), events: { dismiss: "hAAAAAAAAAAA.dismiss" }, children }) as RenderNode;
const page = (...children: RenderNode[]): RenderTree => ({ format: "mesh-render", version: 1, root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children } });

const containers: HTMLElement[] = [];
afterEach(() => {
  containers.splice(0).forEach((each) => each.remove());
  document.documentElement.style.cssText = "";
});

const mount = () => {
  const container = document.createElement("main");
  document.body.append(container);
  containers.push(container);

  return container;
};
const label = (element: Element | null): string => (element === null || element === document.body ? "nothing" : (element.textContent ?? ""));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An application that holds `open` and says what it is told to: honors `dismiss` unless `ignores`. */
const app = (container: HTMLElement, make: (open: boolean) => RenderTree, options: { ignores?: boolean; open?: boolean } = {}) => {
  const state = { open: options.open ?? false, reported: [] as string[] };
  let port: WebPort;

  port = createWebPort({
    container,
    primitives,
    report: (_handler, payload) => {
      state.reported.push(String(payload));

      if (options.ignores !== true) {
        state.open = false;
        port.update(make(false));
      }
    },
  });
  port.draw(make(state.open));

  return { state, port, set: (open: boolean) => { state.open = open; port.update(make(open)); } };
};

describe("a modal dialog", () => {
  const make = (open: boolean) => page(button(3, "opener"), layer("dialog", 2, { open, label: "Sure?" }, [button(10, "yes"), button(11, "no")]));

  it("written open by the server paints, and is upgraded at hydration: modal, with focus moved inside once", async () => {
    const container = mount();
    container.innerHTML = realizeHtml(make(true), primitives);

    const dialog = container.querySelector("dialog")!;

    expect(dialog.open).toBe(true);
    expect(dialog.matches(":modal")).toBe(false);

    const port = createWebPort({ container, primitives, report: () => {} });

    expect(port.hydrate(make(true))).toEqual({ adopted: true });
    expect(dialog.matches(":modal")).toBe(true);
    expect(container.contains(document.activeElement) && dialog.contains(document.activeElement)).toBe(true);
  });

  it("the application that refuses a dismissal keeps it open, also after the second Escape, which the browser will not let a page refuse", async () => {
    const container = mount();
    const { state } = app(container, make, { ignores: true, open: true });
    const dialog = container.querySelector("dialog")!;

    await userEvent.keyboard("{Escape}");
    expect(state.reported).toEqual(["escape"]);
    expect(dialog.matches(":modal")).toBe(true);

    // no click or key between: the browser closes it, and the PORT draws it again once the application has had its moment
    await userEvent.keyboard("{Escape}");
    await wait(300);
    expect(state.reported.length).toBeGreaterThanOrEqual(2);
    expect(dialog.matches(":modal")).toBe(true);
  });

  it("a click on the backdrop is a dismissal with the reason outside; a click inside is not", async () => {
    const container = mount();
    const { state } = app(container, make, { ignores: true, open: true });
    const dialog = container.querySelector("dialog")!;
    const box = dialog.getBoundingClientRect();

    await userEvent.click(container.querySelector("dialog button")!);
    expect(state.reported).toEqual([]);

    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: box.left - 20, clientY: box.top - 20 }));
    expect(state.reported).toEqual(["outside"]);
  });

  it("returns focus to the part that opened it by key, and the page has a modal dialog while it is open", async () => {
    const container = mount();
    const { set, state } = app(container, make);

    container.querySelector("button")!.focus();
    set(true);
    expect(document.documentElement.matches(":has(dialog:modal)")).toBe(true);
    set(false);
    expect(label(document.activeElement)).toBe("opener");
    expect(state.reported).toEqual([]);
  });
});

describe("a popover", () => {
  const make = (kind?: string) => (open: boolean) =>
    page(button(3, "invoker", "invoker"), button(4, "elsewhere"), layer("popover", 2, { open, anchor: "invoker", placement: "bottom", ...(kind === undefined ? {} : { kind }) }, [button(10, "inside")]));

  it("auto: an outside click closes it as a dismissal, and Escape closes it with the reason escape", async () => {
    const container = mount();
    const { state, set } = app(container, make(), { open: true });
    const popover = container.querySelector("[popover]")!;

    expect(popover.matches(":popover-open")).toBe(true);
    await userEvent.click(container.querySelectorAll("button")[1]!);
    await wait(50);
    expect(state.reported).toEqual(["outside"]);
    expect(popover.matches(":popover-open")).toBe(false);

    set(true);
    await userEvent.keyboard("{Escape}");
    await wait(50);
    expect(state.reported).toEqual(["outside", "escape"]);
  });

  it("manual: an outside click does not close it and is not a dismissal", async () => {
    const container = mount();
    const { state } = app(container, make("manual"), { open: true });

    await userEvent.click(container.querySelectorAll("button")[1]!);
    await wait(50);
    expect(state.reported).toEqual([]);
    expect(container.querySelector("[popover]")!.matches(":popover-open")).toBe(true);
  });

  it("an application that ignores the dismissal has it drawn open again", async () => {
    const container = mount();
    const { state } = app(container, make(), { open: true, ignores: true });

    await userEvent.click(container.querySelectorAll("button")[1]!);
    await wait(300);
    expect(state.reported).toEqual(["outside"]);
    expect(container.querySelector("[popover]")!.matches(":popover-open")).toBe(true);
  });

  it("sits against its anchor by the placement (this browser has anchor positioning, so it is looked at)", () => {
    const container = mount();

    app(container, make(), { open: true });
    expect(CSS.supports("position-area", "top")).toBe(true);

    const anchor = container.querySelector("#invoker")!.getBoundingClientRect();
    const popover = container.querySelector("[popover]")!.getBoundingClientRect();
    const middle = (box: DOMRect): number => (box.left + box.right) / 2;

    expect(popover.top).toBeGreaterThanOrEqual(anchor.bottom - 1);
    // against the anchor, not centered in the page as a popover with no anchor is
    expect(Math.abs(middle(popover) - middle(anchor))).toBeLessThan(Math.abs(middle(popover) - window.innerWidth / 2));
  });

  it("hidden by the application, it returns focus to the invoker", () => {
    const container = mount();
    const { set } = app(container, make("manual"));

    (container.querySelector("#invoker") as HTMLElement).focus();
    set(true);
    (container.querySelector("[popover] button") as HTMLElement).focus();
    set(false);
    expect(label(document.activeElement)).toBe("invoker");
  });
});
