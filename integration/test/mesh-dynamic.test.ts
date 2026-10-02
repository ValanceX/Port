// MESH's dynamic structure (conditional and repeated sites, spec §9.10) through
// render-v1 into PORT's keyed reconciliation, every step real:
//
//   MPRX → MESH compiler → template-v1 → MESH runtime → render-v1
//        → PORT Web (draw, update) → DOM objects
//
// and back for handlers: DOM click → PORT → (handler, payload) → MESH dispatch
// → command intent. NEXUS isn't involved: the boundary under test is MESH's
// identity reaching PORT's reconciliation, and the intent is as far back as
// that needs to go.
//
// This uses the MESH checkout's own build (the provisional `mesh-if` and
// `mesh-each` tracers aren't in the published 0.6.0 this workspace depends
// on), found at `MESH_CHECKOUT` or the sibling `../Mesh`. Without a built
// checkout the suite is skipped. PORT's dependency is not changed: nothing
// here is PORT's code importing MESH internals, only the test composing the
// two packages' public APIs, as the composer does.
//
// PORT is given only components `page`, `note` and `row`. It has no
// realization for `mesh-if` or `mesh-each`, which never reach it: MESH makes
// them structure, not nodes.
import type { Render as MeshRender, RenderNode, RenderTree } from "@valancex/mesh-runtime";
import type { WebPrimitives } from "@valancex/port-web";

import { WebRealizationError, createWebPort } from "@valancex/port-web";
import { JSDOM } from "jsdom";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const checkout = process.env.MESH_CHECKOUT ?? fileURLToPath(new URL("../../../Mesh/", import.meta.url));
const built = existsSync(`${checkout}/packages/mesh-runtime/dist/mesh-runtime.wasm`) && existsSync(`${checkout}/packages/mesh-compiler/dist/mesh.wasm`);

type Compiler = typeof import("@valancex/mesh-compiler");
type Runtime = typeof import("@valancex/mesh-runtime");

const load = async <T>(pkg: string): Promise<T> => import(pathToFileURL(`${checkout}/packages/${pkg}/dist/index.js`).href) as Promise<T>;

const MODEL = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    note: { props: {}, events: {}, commands: {}, scope: {} },
    row: { props: {}, events: { tap: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: { type: { kind: "boolean" }, required: true } }, events: {}, commands: {}, scope: {} },
    "mesh-each": { props: {
      items: { type: { kind: "list", element: { kind: "any" } }, required: true },
      as: { type: { kind: "string" }, required: true },
      key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
    list: { props: {}, events: {}, commands: { pick: { parameters: [{ name: "id", type: { kind: "any" } }] } },
      scope: { items: { kind: "list", element: { kind: "record", fields: {
        id: { type: { kind: "any" }, required: true }, label: { type: { kind: "string" }, required: true } } } } } },
    cond: { props: {}, events: {}, commands: { go: { parameters: [] } },
      scope: { show: { kind: "boolean" }, lead: { kind: "boolean" }, mode: { kind: "boolean" } } },
  },
});

const LIST = '<page><note>head</note><mesh-each items={items} as="item" key={item.id}><row on.tap={pick(item.id)}>{item.label}</row></mesh-each><note>tail</note></page>';
const COND = '<page><mesh-if when={lead}><note>lead</note></mesh-if><note>fixed</note><mesh-if when={show}><row on.tap={go()}>shown</row></mesh-if><mesh-if when={mode}><note>one</note><note>two</note></mesh-if></page>';

const primitives: WebPrimitives = {
  page: { element: "section" },
  note: { element: "span" },
  row: { element: "button", events: { tap: { type: "click" } } },
};

describe.skipIf(!built)("MESH dynamic structure → render-v1 → PORT keyed reconciliation", () => {
  const setup = async (root: "list" | "cond", source: string) => {
    const compiler = await load<Compiler>("mesh-compiler");
    const runtime = await load<Runtime>("mesh-runtime");
    const compiled = await compiler.compile({ source, path: `${root}.mprx`, model: { manifest: MODEL, path: "model.json", component: root } });

    if (compiled.template === undefined) {
      throw new Error(`${root} doesn't compile: ${JSON.stringify(compiled.diagnostics)}`);
    }

    const templates = [JSON.stringify(compiled.template)];
    const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "http://localhost/" });
    const container = window.document.querySelector("main")!;
    const reported: Array<readonly [string, unknown]> = [];
    const port = createWebPort({ container, primitives, report: (handler, payload) => { reported.push([handler, payload]); } });
    let drawn: MeshRender | undefined;

    const renderOf = async (snapshot: Record<string, unknown>): Promise<MeshRender> => {
      const result = await runtime.render({ program: { root, templates }, model: MODEL, snapshot });

      if (result.render === undefined) {
        throw new Error(JSON.stringify(result.diagnostics));
      }

      return result.render;
    };

    /** What PORT is given: the first render is drawn, each later one from the same program updates. */
    const show = async (snapshot: Record<string, unknown>): Promise<void> => {
      const render = await renderOf(snapshot);

      if (drawn === undefined) {
        port.draw(render.tree);
      } else {
        port.update(render.tree);
      }

      drawn = render;
    };

    /**
     * Each node of the drawn tree by its text: its MESH identity as render-v1
     * carries it (`key`), and the DOM element PORT realized for it. Pairing the
     * tree with the DOM by child index is observation only; no assertion below
     * takes identity from it.
     */
    const realized = (): ReadonlyMap<string, { readonly key: string; readonly element: Element }> => {
      const found = new Map<string, { readonly key: string; readonly element: Element }>();
      const walk = (node: RenderNode, element: Element): void => {
        const label = node.children.filter((child) => child.type === "text").map((child) => child.text).join("");
        found.set(`${node.component}:${label}`, { key: node.key, element });
        node.children.forEach((child, index) => {
          if (child.type === "node") {
            walk(child, element.childNodes[index] as Element);
          }
        });
      };

      walk(drawn!.tree.root, container.firstElementChild!);

      return found;
    };

    const click = (element: Element) => element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const intent = async (handler: string, payload?: unknown) => {
      const result = await runtime.dispatch(drawn!, handler, payload);

      if (result.intent === undefined) {
        throw new Error(JSON.stringify(result.diagnostics));
      }

      return result.intent;
    };
    const order = (): string[] => Array.from(container.querySelectorAll("button")).map((button) => button.textContent!);

    return { show, realized, click, intent, reported, order, container, port, renderOf, tree: (): RenderTree => drawn!.tree };
  };

  const items = (...labels: string[]) => ({ items: labels.map((label) => ({ id: label.toLowerCase(), label })) });
  const row = (label: string) => `row:${label}`;

  describe("repeated sites (mesh-each)", () => {
    it("reorder: [A, B, C] → [C, A, B] moves the same target objects, under the same keys", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B", "C"));
      const before = app.realized();
      await app.show(items("C", "A", "B"));
      const after = app.realized();

      expect(app.order()).toEqual(["C", "A", "B"]);
      for (const label of ["A", "B", "C"]) {
        expect(after.get(row(label))!.key).toBe(before.get(row(label))!.key);
        expect(after.get(row(label))!.element).toBe(before.get(row(label))!.element);
      }
      // Distinct identities are distinct objects.
      expect(new Set(["A", "B", "C"].map((label) => after.get(row(label))!.element)).size).toBe(3);
    });

    it("insert: [A, B] → [A, X, B] keeps A and B, creates X", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B"));
      const before = app.realized();
      await app.show(items("A", "X", "B"));
      const after = app.realized();

      expect(app.order()).toEqual(["A", "X", "B"]);
      expect(after.get(row("A"))!.element).toBe(before.get(row("A"))!.element);
      expect(after.get(row("B"))!.element).toBe(before.get(row("B"))!.element);
      expect(after.get(row("B"))!.key).toBe(before.get(row("B"))!.key);
      expect([...before.values()].map((part) => part.element)).not.toContain(after.get(row("X"))!.element);
      // The statics around the repeat keep their objects too.
      expect(after.get("note:tail")!.element).toBe(before.get("note:tail")!.element);
    });

    it("remove: [A, B, C] → [A, C] disposes B, and C does not inherit its object", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B", "C"));
      const before = app.realized();
      await app.show(items("A", "C"));
      const after = app.realized();

      expect(app.order()).toEqual(["A", "C"]);
      expect(after.get(row("A"))!.element).toBe(before.get(row("A"))!.element);
      expect(after.get(row("C"))!.element).toBe(before.get(row("C"))!.element);
      expect(after.get(row("C"))!.element).not.toBe(before.get(row("B"))!.element);
      expect(before.get(row("B"))!.element.isConnected).toBe(false);
    });

    it("reappearance: [A] → [] → [A] is the same identity and a new target object", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A"));
      const first = app.realized().get(row("A"))!;
      await app.show(items());
      expect(first.element.isConnected).toBe(false);
      expect(app.order()).toEqual([]);
      await app.show(items("A"));
      const again = app.realized().get(row("A"))!;

      expect(again.key).toBe(first.key);
      expect(again.element).not.toBe(first.element);
      expect(again.element.isConnected).toBe(true);
    });

    it("duplicate keys fail closed in MESH, so nothing reaches PORT and nothing is mutated", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B"));
      const html = app.container.innerHTML;
      const before = app.realized();
      const duplicated = await app.renderOf({ items: [{ id: "a", label: "A" }, { id: "a", label: "again" }] }).then(() => "rendered", (error: Error) => error.message);

      expect(duplicated).toContain("runtime-duplicate-key");
      expect(app.container.innerHTML).toBe(html);
      expect(app.realized().get(row("A"))!.element).toBe(before.get(row("A"))!.element);
    });

    it("handlers follow the repeated identity: after [A, B] → [B, A], each element reports its own item", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B"));
      const before = app.realized();
      await app.show(items("B", "A"));

      app.click(before.get(row("A"))!.element);
      app.click(before.get(row("B"))!.element);
      expect(app.reported).toHaveLength(2);
      const [a, b] = await Promise.all(app.reported.map(([handler, payload]) => app.intent(handler, payload)));

      expect(a!.command).toEqual({ component: "list", name: "pick" });
      expect(a!.arguments).toEqual([{ value: "a" }]);
      expect(b!.arguments).toEqual([{ value: "b" }]);
      // The first button is B's now, by object and by what it reports.
      app.reported.length = 0;
      app.click(app.container.querySelectorAll("button")[0]!);
      expect((await app.intent(app.reported[0]![0]))!.arguments).toEqual([{ value: "b" }]);
    });

    it("a removed item's object reports nothing, and its handler is unknown to the next render", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B"));
      const gone = app.realized().get(row("B"))!;
      const handler = (app.tree().root.children.find((child) => child.type === "node" && child.key === gone.key) as RenderNode | undefined)?.events.tap
        ?? JSON.stringify(app.tree());
      await app.show(items("A"));
      app.click(gone.element);

      expect(app.reported).toEqual([]);
      const result = await (await load<Runtime>("mesh-runtime")).dispatch(await app.renderOf(items("A")), handler);
      expect(result.diagnostics?.diagnostics.map((d) => d.code)).toEqual(["runtime-unknown-handler"]);
    });
  });

  describe("conditional sites (mesh-if)", () => {
    const snapshot = (show: boolean, lead = false, mode = false) => ({ show, lead, mode });

    it("disappearance disposes the realization, and reappearance is the same identity in a fresh one", async () => {
      const app = await setup("cond", COND);
      await app.show(snapshot(true));
      const first = app.realized().get(row("shown"))!;
      await app.show(snapshot(false));
      expect(app.realized().has(row("shown"))).toBe(false);
      expect(first.element.isConnected).toBe(false);
      await app.show(snapshot(true));
      const again = app.realized().get(row("shown"))!;

      expect(again.key).toBe(first.key);
      expect(again.element).not.toBe(first.element);
    });

    it("a continuously present branch keeps its object and key, however its siblings change", async () => {
      const app = await setup("cond", COND);
      await app.show(snapshot(true, false));
      const before = app.realized();
      await app.show(snapshot(true, true));
      const after = app.realized();

      // An unrelated conditional sibling now comes before it.
      expect(after.has("note:lead")).toBe(true);
      expect(after.get(row("shown"))!.key).toBe(before.get(row("shown"))!.key);
      expect(after.get(row("shown"))!.element).toBe(before.get(row("shown"))!.element);
      expect(after.get("note:fixed")!.element).toBe(before.get("note:fixed")!.element);
      await app.show(snapshot(true, false));
      expect(app.realized().get(row("shown"))!.element).toBe(before.get(row("shown"))!.element);
    });

    it("alternatives are distinct sites: switching branches replaces the object, even of the same component", async () => {
      const app = await setup("cond", COND);
      await app.show(snapshot(false, false, true));
      const one = app.realized().get("note:one")!;
      await app.show(snapshot(false, false, false));
      expect(app.realized().has("note:one")).toBe(false);
      expect(one.element.isConnected).toBe(false);
      await app.show(snapshot(false, false, true));

      expect(app.realized().get("note:one")!.key).toBe(one.key);
      expect(app.realized().get("note:one")!.element).not.toBe(one.element);
    });

    it("the conditional's handler is its node's identity and event, and routes to it", async () => {
      const app = await setup("cond", COND);
      await app.show(snapshot(true));
      app.click(app.realized().get(row("shown"))!.element);
      const intent = await app.intent(app.reported[0]![0]);

      expect(intent.command).toEqual({ component: "cond", name: "go" });
    });
  });

  describe("the boundary", () => {
    it("MESH's keys reach PORT unchanged and distinct, and valid MESH never gives one key two components", async () => {
      const app = await setup("list", LIST);
      await app.show(items("A", "B", "C"));
      const keys: string[] = [];
      const components = new Map<string, string>();
      const walk = (node: RenderNode): void => {
        keys.push(node.key);
        components.set(node.key, node.component);
        node.children.forEach((child) => { if (child.type === "node") { walk(child); } else { keys.push(child.key); } });
      };
      walk(app.tree().root);

      expect(new Set(keys).size).toBe(keys.length);
      // Across renders of this program, a key is only ever one component.
      for (const labels of [["C", "A", "B"], ["A", "X", "B"], ["B"]]) {
        await app.show(items(...labels));
        const now = new Map<string, string>();
        walk(app.tree().root);
        for (const [key, component] of components) {
          now.set(key, component);
        }
        expect(now.size).toBe(components.size);
      }
    });

    it("PORT replaces a key whose component changed (its own safety rule, not MESH's), and refuses duplicates before mutating", () => {
      const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>", { url: "http://localhost/" });
      const container = window.document.querySelector("main")!;
      const port = createWebPort({ container, primitives, report: () => {} });
      const key = (n: number) => `k${String(n).padStart(22, "A")}`;
      const of = (component: string): RenderTree => ({ format: "mesh-render", version: 1, root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children: [{ type: "node", key: key(2), component, props: {}, events: {}, children: [] }] } });

      port.draw(of("note"));
      const span = container.querySelector("span")!;
      port.update(of("row"));
      expect(span.isConnected).toBe(false);
      expect(container.querySelector("button")).not.toBeNull();

      const html = container.innerHTML;
      const twice: RenderTree = { format: "mesh-render", version: 1, root: { type: "node", key: key(1), component: "page", props: {}, events: {}, children: [of("note").root.children[0]!, of("note").root.children[0]!] } };
      expect(() => port.update(twice)).toThrow(WebRealizationError);
      expect(container.innerHTML).toBe(html);
    });
  });
});
