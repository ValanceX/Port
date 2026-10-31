// The opt-in vocabulary (`@valancex/port-web/vocabulary`, Provisional; north-star refinements, C-2): the portable core as a table createWebPort accepts, realizing each primitive, and a manifest equal to the Desktop PORT's.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { createWebPort } from "../src/index.js";
import { realizeHtml } from "../src/server.js";
import { vocabulary, vocabularyManifest } from "../src/vocabulary.js";

import { dom, handler, node, reports, text, tree } from "./support.js";

const core = ["column", "row", "heading", "text", "button", "checkbox", "textfield"];

describe("the opt-in Web vocabulary", () => {
  it("covers the portable core", () => {
    expect(Object.keys(vocabulary)).toEqual(core);
  });

  it("its manifest is the Desktop PORT's, for the same components", () => {
    const desktop = JSON.parse(readFileSync(new URL("../../port-desktop/vocabulary.json", import.meta.url), "utf8")) as { components: Record<string, unknown> };

    expect(Object.keys(vocabularyManifest.components)).toEqual(core);
    for (const name of core) {
      expect(vocabularyManifest.components[name as keyof typeof vocabularyManifest.components]).toEqual(desktop.components[name]);
    }
  });

  it("realizes only props and events its manifest declares", () => {
    for (const [name, primitive] of Object.entries(vocabulary)) {
      const declared = vocabularyManifest.components[name as keyof typeof vocabularyManifest.components] as { props: Record<string, unknown>; events: Record<string, unknown> };

      for (const prop of Object.keys(primitive.props ?? {})) expect(declared.props, `${name}.${prop}`).toHaveProperty(prop);
      for (const event of Object.keys(primitive.events ?? {})) expect(declared.events, `${name}.${event}`).toHaveProperty(event);
    }
  });

  it("is accepted by createWebPort and renders each primitive", () => {
    const { window, container } = dom();
    const { report, calls: seen } = reports();
    const port = createWebPort({ container, primitives: vocabulary, report });
    const t = tree(node(1, "column", {}, [
      node(2, "row", {}, [{ ...node(3, "heading", { level: 2 }, [text(4, "Title")]), propText: { level: "2" } }, node(5, "text", { id: "t" }, [text(6, "Body")])]),
      node(7, "button", { disabled: false, label: "Go" }, [text(8, "Go")], { click: handler(1) }),
      node(9, "checkbox", { checked: true, label: "Agree" }, [], { change: handler(2) }),
      node(10, "textfield", { value: "Ada", placeholder: "Name" }, [], { change: handler(3), submit: handler(4) }),
    ]));

    port.draw(t);
    const q = (selector: string): Element => container.querySelector(selector)!;
    expect(q("vlx-column > vlx-row > h2").getAttribute("aria-level")).toBe("2");
    expect(q("span#t").textContent).toBe("Body");
    expect(q("button").getAttribute("aria-label")).toBe("Go");
    expect((q("input[type=checkbox]") as HTMLInputElement).checked).toBe(true);
    expect((q("input[data-vlx=textfield]") as HTMLInputElement).value).toBe("Ada");

    q("button").dispatchEvent(new window.Event("click", { bubbles: true }));
    const box = q("input[type=checkbox]") as HTMLInputElement;
    box.checked = false;
    box.dispatchEvent(new window.Event("change", { bubbles: true }));
    q("input[data-vlx=textfield]").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(seen).toEqual([[handler(1)], [handler(2), false], [handler(4)]]);
    expect(realizeHtml(t, vocabulary)).toContain("<vlx-column");
  });
});
