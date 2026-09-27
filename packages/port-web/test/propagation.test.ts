// CHARACTERIZATION, NOT CONTRACT. MESH doesn't define whether an event on a
// nested node also triggers an ancestor's binding (see
// docs/architecture/2026-09-27-event-propagation-audit.md). These tests pin
// what the Web PORT does today, which is the DOM's bubbling, so that a change
// is visible. They don't make it Valance semantics, and applications must
// not rely on it. When MESH decides, these become contract tests or change.
import { describe, expect, it } from "vitest";

import { createWebPort } from "../src/index.js";

import { dom, handler, node, reports, text, tree } from "./support.js";

const primitives = {
  card: { element: "div", events: { select: { type: "click" }, click: { type: "click" } } },
  button: { element: "button", events: { click: { type: "click" }, tap: { type: "click" } } },
  label: { element: "span" },
};

describe("event propagation: an open MESH question, characterized", () => {
  it("today: a click on a bound child also reports a bound ancestor's same-named event, child first", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    createWebPort({ container, primitives, report })
      .draw(tree(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { click: handler(2) })], { click: handler(1) })));

    container.querySelector("button")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(calls).toEqual([[handler(2)], [handler(1)]]);
  });

  it("today: differently named events realized as the same DOM event also both report", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    createWebPort({ container, primitives, report })
      .draw(tree(node(1, "card", {}, [node(2, "button", {}, [text(3, "Go")], { tap: handler(2) })], { select: handler(1) })));

    container.querySelector("button")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(calls).toEqual([[handler(2)], [handler(1)]]);
  });

  it("today: a click on unbound content reports the nearest bound ancestor", () => {
    const { window, container } = dom();
    const { calls, report } = reports();
    createWebPort({ container, primitives, report })
      .draw(tree(node(1, "button", {}, [node(2, "label", {}, [text(3, "Go")])], { click: handler(1) })));

    container.querySelector("span")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(calls).toEqual([[handler(1)]]);
  });
});
