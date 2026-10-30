// The composer helper (Tier 1): a Mesh screen drives a Web PORT. The caller shows snapshots and receives
// intents; it never picks draw or patch, nor releases a render. These run the real screen against the slice.
import { compile } from "@valancex/mesh-compiler";
import { openScreen } from "@valancex/mesh-runtime";
import { describe, expect, it, vi } from "vitest";

import { composeWebPort } from "../src/index.js";

import { dom, handler, node, read, readJson, sliceProgram, slicePrimitives, text, tree } from "./support.js";

const first = readJson("snapshots/first.json") as Record<string, unknown>;
const second = readJson("snapshots/second.json") as Record<string, unknown>;

const setup = async (options: { readonly native?: Parameters<typeof composeWebPort>[0]["native"] } = {}) => {
  const { window, container } = dom();
  const intents: Array<unknown> = [];
  const errors: Array<unknown> = [];
  const screen = openScreen({ program: await sliceProgram(), model: read("components.json") });
  const composer = composeWebPort({ screen, container, primitives: slicePrimitives, onIntent: (intent) => intents.push(intent), onError: (error) => errors.push(error), ...(options.native === undefined ? {} : { native: options.native }) });
  const click = (selector: string) => container.querySelector(selector)!.dispatchEvent(new window.Event("click", { bubbles: true }));
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  return { window, container, intents, errors, screen, composer, click, settle };
};

describe("composeWebPort", () => {
  it("draws the first snapshot, then patches the DOM in place for the next", async () => {
    const { container, composer } = await setup();

    await composer.show(first);
    const name = container.querySelector("span")!;

    expect(name.textContent).toBe("Ada Lovelace");
    await composer.show(second);
    // Patched, not redrawn: the same DOM node holds the new text.
    expect(container.querySelector("span")).toBe(name);
    expect(name.textContent).toBe("Ada King");
  });

  it("hands the intent of an interaction to the callback", async () => {
    const { intents, composer, click, settle } = await setup();

    await composer.show(first);
    click("button");
    await settle();
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ command: { name: "refresh" } });
  });

  it("passes the PORT's options through, the native hatch included", async () => {
    const seen: Array<string> = [];
    const { composer } = await setup({ native: { avatar: (element) => { seen.push(element.tagName); } } });

    await composer.show(first);
    expect(seen).toEqual(["IMG", "IMG"]);
  });

  it("gives diagnostics back and draws nothing", async () => {
    const { container, composer } = await setup();
    const shown = await composer.show({ title: 1 });

    expect(shown).toHaveProperty("diagnostics");
    expect(container.childNodes).toHaveLength(0);
  });

  it("close empties the container and ends the screen's render; the composer shows again afresh", async () => {
    const { container, composer } = await setup();

    await composer.show(first);
    composer.close();
    expect(container.childNodes).toHaveLength(0);
    await composer.show(second);
    expect(container.querySelector("span")!.textContent).toBe("Ada King");
  });
});

// A program with units: `tabs` has a command a transition runs, and an event (`change`) it raises to a handler the page bound.
const MODEL = JSON.stringify({
  version: 1,
  types: {},
  components: {
    box: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    tabs: {
      props: { at: { type: { kind: "number" }, required: false } },
      events: { change: { payload: { kind: "number" } } },
      commands: {},
      scope: {},
      unit: { state: { at: { type: { kind: "number" }, default: 0, controllable: true } }, commands: { select: { parameters: [{ name: "n", type: { kind: "number" } }] } } },
    },
    page: { props: {}, events: {}, commands: { chose: { parameters: [{ name: "n", type: { kind: "number" } }] } }, scope: {} },
  },
});
const compiled = async (component: string, source: string): Promise<string> => {
  const result = await compile({ source, path: `${component}.mprx`, model: { manifest: MODEL, path: "model.json", component } });

  return JSON.stringify(result.template);
};
const unitPrimitives = { box: { element: "div" }, button: { element: "button", events: { click: { type: "click" } } } };
const unitSetup = async (onDiagnostics?: (diagnostics: unknown) => void) => {
  const { window, container } = dom();
  const intents: Array<unknown> = [];
  const errors: Array<unknown> = [];
  const templates = [await compiled("page", "<box><tabs /><tabs at={7} on.change={chose($event)} /></box>"), await compiled("tabs", "<box><button on.click={select(at + 1)}>at {at}</button></box>")];
  const screen = openScreen({
    program: { root: "page", templates },
    model: MODEL,
    transitions: { tabs: { select: (_state, n) => ({ changes: { at: n }, raise: ["change", n] }) } },
  });
  const composer = composeWebPort({ screen, container, primitives: unitPrimitives, onIntent: (intent) => intents.push(intent), onError: (error) => errors.push(error), ...(onDiagnostics === undefined ? {} : { onDiagnostics }) });
  const click = (index: number) => container.querySelectorAll("button")[index]!.dispatchEvent(new window.Event("click", { bubbles: true }));
  const labels = () => Array.from(container.querySelectorAll("button"), (button) => button.textContent);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  return { container, intents, errors, screen, composer, click, labels, settle };
};

describe("composeWebPort with units", () => {
  it("applies a unit's patches in place, and gives no intent when the transition raised none", async () => {
    const { intents, composer, click, labels, settle } = await unitSetup();

    await composer.show({});
    expect(labels()).toEqual(["at 0", "at 7"]);
    click(0);
    await settle();
    expect(labels()).toEqual(["at 1", "at 7"]);
    expect(intents).toEqual([]);
  });

  it("applies the unit's patches, then hands over the intent of what it raised", async () => {
    const { intents, composer, click, labels, settle } = await unitSetup();

    await composer.show({});
    click(1);
    await settle();
    // `at` is the page's (at={7}): the change is not drawn, and the page's handler gets the raised event.
    expect(labels()).toEqual(["at 0", "at 7"]);
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ command: { component: "page", name: "chose" }, arguments: [{ value: 8 }] });
  });

  it("applies each result before dispatching the next report", async () => {
    const { composer, click, labels, settle } = await unitSetup();

    await composer.show({});
    // Two clicks before either result is awaited: the second select sees the first's state.
    click(0);
    click(0);
    await settle();
    expect(labels()).toEqual(["at 2", "at 7"]);
  });
});

describe("composeWebPort's failures", () => {
  it("gives the diagnostics of a dispatch to onDiagnostics", async () => {
    const seen: Array<unknown> = [];
    const { composer, screen, click, settle } = await unitSetup((diagnostics) => seen.push(diagnostics));

    await composer.show({});
    screen.dispatch = async () => ({ diagnostics: { runtime: "refused" } }) as never;
    click(0);
    await settle();
    expect(seen).toEqual([{ runtime: "refused" }]);
  });

  it("routes a rejected dispatch to onError, and the next report still goes through", async () => {
    const { composer, screen, errors, click, labels, settle } = await unitSetup();
    const dispatch = screen.dispatch.bind(screen);

    await composer.show({});
    screen.dispatch = () => Promise.reject(new Error("gone"));
    click(0);
    await settle();
    expect(errors).toEqual([new Error("gone")]);
    screen.dispatch = dispatch;
    click(0);
    await settle();
    expect(labels()).toEqual(["at 1", "at 7"]);
  });
});

// A screen of a test's own, whose results the test settles when it chooses.
const stubScreen = (props: Record<string, number> = {}) => {
  const calls: Array<string> = [];
  const pending: Array<(result: object) => void> = [];
  const screen = {
    calls,
    closed: 0,
    show: (_snapshot: Record<string, unknown>) => {
      calls.push("show");

      return Promise.resolve({ tree: tree(node(1, "box", props, [node(2, "button", {}, [text(3, "go")], { click: handler(1) })])) });
    },
    dispatch: (_handler: string) => {
      calls.push("dispatch");

      return new Promise<object>((resolve) => pending.push(resolve));
    },
    close() {
      screen.closed++;
    },
  };

  return { screen, calls, pending };
};
const ticks = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("composeWebPort's order and failures", () => {
  it("does not dispatch the next report, nor show, until the result before it is applied", async () => {
    const { container, window } = dom();
    const { screen, calls, pending } = stubScreen();
    const composer = composeWebPort({ screen: screen as never, container, primitives: unitPrimitives, onIntent: () => {} });
    const click = () => container.querySelector("button")!.dispatchEvent(new window.Event("click", { bubbles: true }));

    await composer.show({});
    click();
    click();
    const shown = composer.show({});

    await ticks();
    expect(calls).toEqual(["show", "dispatch"]);
    pending[0]!({ intent: 1 });
    await ticks();
    expect(calls).toEqual(["show", "dispatch", "dispatch"]);
    pending[1]!({ intent: 2 });
    await shown;
    expect(calls).toEqual(["show", "dispatch", "dispatch", "show"]);
  });

  it("ends the PORT and the screen when the PORT can't take what the screen gave, so the next show draws afresh", async () => {
    const { container } = dom();
    const { screen } = stubScreen({ size: 1 });
    // The table realizes no `size` prop: the tree is refused.
    const composer = composeWebPort({ screen: screen as never, container, primitives: unitPrimitives, onIntent: () => {} });

    await expect(composer.show({})).rejects.toMatchObject({ code: "unrealized-prop" });
    expect(container.childNodes).toHaveLength(0);
    expect(screen.closed).toBe(1);
  });

  it("reports a rejected dispatch as an uncaught error when no onError is given", async () => {
    const { container, window } = dom();
    const { screen } = stubScreen();
    const reported = vi.fn();
    const composer = composeWebPort({ screen: screen as never, container, primitives: unitPrimitives, onIntent: () => {} });

    vi.stubGlobal("reportError", reported);
    try {
      await composer.show({});
      screen.dispatch = () => Promise.reject(new Error("gone"));
      container.querySelector("button")!.dispatchEvent(new window.Event("click", { bubbles: true }));
      await ticks();
      expect(reported).toHaveBeenCalledWith(new Error("gone"));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
