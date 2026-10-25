// The ARIA Authoring Practices modal dialog keys, as generated vectors (overlays/dialog-modal.vectors.json), run against the Web PORT's dialog in Chromium with real key presses. The pattern is the
// reference for the keys only; what is looked at is the DOM's own: which element has focus, whether the dialog is `:modal`, and what the PORT reported.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import { attribute, createWebPort, layerDismiss, layerProp, type WebPort, type WebPrimitives } from "@valancex/port-web";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it } from "vitest";

import vectors from "../../overlays/dialog-modal.vectors.json" with { type: "json" };

interface Step {
  readonly focus?: string;
  readonly open?: boolean;
  readonly press?: string;
  readonly remove?: string;
  readonly expect?: { readonly focused?: string; readonly focusedIn?: ReadonlyArray<string>; readonly open?: boolean; readonly modal?: boolean; readonly name?: string; readonly reported?: ReadonlyArray<string> };
}
interface Vector {
  readonly name: string;
  readonly apg: string;
  readonly layout: { readonly tabbables: number };
  readonly app?: { readonly ignores?: boolean };
  readonly steps: ReadonlyArray<Step>;
}

const primitives: WebPrimitives = {
  page: { element: "section" },
  button: { element: "button", events: { click: { type: "click" } } },
  dialog: { element: "dialog", layer: "modal", props: { open: layerProp("open"), label: attribute("aria-label") }, events: { dismiss: layerDismiss } },
};

const key = (n: number): string => `k${String(n).padStart(22, "A")}`;
const button = (n: number, label: string): RenderNode => ({ type: "node", key: key(n), component: "button", props: {}, events: {}, children: [{ type: "text", key: key(n + 500), text: label }] });
const dialog = (open: boolean, tabbables: number): RenderNode => ({
  type: "node",
  key: key(2),
  component: "dialog",
  props: { open, label: "Dialog" },
  propText: { open: String(open) },
  events: { dismiss: "hAAAAAAAAAAA.dismiss" },
  children: Array.from({ length: tabbables }, (_, index) => button(10 + index, `d${index + 1}`)),
} as RenderNode);

const containers: HTMLElement[] = [];
afterEach(() => containers.splice(0).forEach((each) => each.remove()));

const run = async (vector: Vector): Promise<void> => {
  const container = document.createElement("main");
  document.body.append(container);
  containers.push(container);

  let open = false;
  let opener = true;
  const reported: string[] = [];
  let port: WebPort;
  const tree = (): RenderTree => ({
    format: "mesh-render",
    version: 1,
    root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children: [...(opener ? [button(3, "opener")] : []), button(4, "elsewhere"), dialog(open, vector.layout.tabbables)] },
  });
  const show = (): void => port.update(tree());

  port = createWebPort({
    container,
    primitives,
    report: (_handler, payload) => {
      reported.push(`dismiss:${String(payload)}`);

      if (vector.app?.ignores !== true) {
        open = false;
        show();
      }
    },
  });
  port.draw(tree());

  const label = (element: Element | null): string => (element === null || element === document.body ? "nothing" : (element.textContent ?? ""));
  const root = (): HTMLDialogElement => container.querySelector("dialog")!;

  for (const [index, step] of vector.steps.entries()) {
    const at = `${vector.name}, step ${index + 1} (${vector.apg})`;

    if (step.focus !== undefined) {
      (Array.from(container.querySelectorAll("button")).find((each) => each.textContent === step.focus) as HTMLElement).focus();
    }

    if (step.open !== undefined) {
      open = step.open;
      reported.length = 0;
      show();
    }

    if (step.remove !== undefined) {
      opener = false;
      show();
    }

    if (step.press !== undefined) {
      await userEvent.keyboard(step.press === "Shift+Tab" ? "{Shift>}{Tab}{/Shift}" : `{${step.press}}`);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    const expected = step.expect;

    if (expected !== undefined) {
      if (expected.focused !== undefined) expect(label(document.activeElement), at).toBe(expected.focused);
      if (expected.focusedIn !== undefined) expect(expected.focusedIn, at).toContain(label(document.activeElement));
      if (expected.open !== undefined) expect(open, at).toBe(expected.open);
      if (expected.modal !== undefined) expect(root().matches(":modal"), at).toBe(expected.modal);
      if (expected.name !== undefined) expect(root().getAttribute("aria-label"), at).toBe(expected.name);
      if (expected.reported !== undefined) expect(reported, at).toEqual(expected.reported);
    }
  }
};

describe("the APG modal dialog, as vectors, in Chromium", () => {
  for (const vector of vectors.vectors as unknown as ReadonlyArray<Vector>) {
    it(vector.name, async () => run(vector));
  }
});
