// Server rendering and hydration through the whole slice, every step real
// (docs/superpowers/specs/2026-09-28-port-web-ssr.md §6, §12):
//
//   server: NEXUS state → host → MESH render-v1 → PORT realizeHtml → HTML
//   page:   HTML, parsed as a page load parses it, in a fresh DOM
//   client: NEXUS initialized with the same state → host → MESH render-v1
//           → PORT hydrate → click → MESH intent → NEXUS dispatch
//           → new render → PORT update
//
// The two sides share nothing but the HTML and the serialized state, as a
// server and a browser would.
import type { WebPrimitives } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import { realizeHtml } from "@valancex/port-web/server";
import { Effect, Exit, Layer, Option } from "effect";
import { JSDOM } from "jsdom";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { Team, application, compileProgram, initialTeam, primitives, read, readJson, second, until } from "./app.js";
import { composer } from "./compose.js";

type State = Pick<Team, "title" | "first" | "second" | "compact">;

/** Runs `body` in a started NEXUS application whose state is `state`, and shuts it down. */
const inApp = <A>(state: State, body: (context: {
  readonly team: Nexus.State.StateHandle<Team>;
  readonly run: <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Promise<Exit.Exit<X, F>>;
}) => Promise<A>): Promise<A> => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "port-ssr", runtime: Layer.empty }));
  const team = yield* Nexus.Application.createState(running, Team, { ...state, selectedUserId: Option.none() });
  const run = <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
  const result = yield* Effect.promise(() => body({ team, run }));
  yield* Nexus.Application.shutdown(running);

  return result;
})));

/** The server: renders `state` with NEXUS and MESH, and realizes the tree as HTML. Returns the page, and the state it embeds. */
const serve = async (state: State, table: WebPrimitives = primitives, users?: string) => {
  const program = await compileProgram(users === undefined ? {} : { users });
  const html = await inApp(state, async ({ team }) => realizeHtml((await Effect.runPromise(application(team, program).render)).tree, table));

  // The application serializes its own state into the page; NEXUS and PORT don't.
  return { html, embedded: JSON.stringify(state) };
};

/** A page load: the server HTML inside the container, parsed as a document. */
const load = (html: string) => {
  const { window } = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`);
  const container = window.document.querySelector("main")!;
  const click = (target: Element) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const nodes = (root: Node): ReadonlyArray<Node> => Array.from(root.childNodes).flatMap((child) => [child, ...nodes(child)]);

  return { window, container, click, nodes: () => nodes(container) };
};

/** What a container realizes: names, namespaces, exact attribute sets and text, in order. */
const realized = (root: Node): unknown => Array.from(root.childNodes, (node) => node.nodeType === 3
  ? { text: (node as Text).data }
  : { element: (node as Element).localName, namespace: (node as Element).namespaceURI, attributes: Array.from((node as Element).attributes, (a) => [a.name, a.value]).sort(), children: realized(node) });

const commandOf = (exit: Exit.Exit<Nexus.Mesh.Dispatched, unknown>) =>
  Exit.isSuccess(exit) ? exit.value.intent : "failed";

describe("SSR → hydrate → NEXUS → update, through the slice", () => {
  it("adopts the server's DOM, dispatches with the client's render, and updates the server's nodes in place", async () => {
    const { html, embedded } = await serve(initialTeam);
    const page = load(html);
    const server = page.nodes();
    const program = await compileProgram();

    const result = await inApp(JSON.parse(embedded) as State, async ({ team, run }) => {
      const app = composer({ container: page.container, primitives }, run);
      const hydration = await app.hydrate(application(team, program));
      const adoptedAll = server.every((node) => page.container.contains(node));
      const img = page.container.querySelector("img")!;

      // A click on a server-created avatar: resolved through the hydrated tree, dispatched to NEXUS.
      page.click(img);
      await app.settled();

      // Refresh: NEXUS changes state and renders; the PORT updates the server's nodes.
      page.click(page.container.querySelector("button")!);
      await app.settled();
      await until(() => img.getAttribute("src") === "ada-2.png");

      const after = page.nodes();
      const sameImg = page.container.querySelector("img") === img;
      const drawnFresh = load("");
      const fresh = composer({ container: drawnFresh.container, primitives }, run);
      await fresh.show(application(team, program));
      const parity = realized(page.container);
      const expected = realized(drawnFresh.container);
      await fresh.stop();
      await app.stop();

      return {
        hydration, adoptedAll, operations: app.operations, dispatched: app.dispatched,
        sameImg,
        serverNodesKept: server.filter((node) => node.nodeType === 1).every((node) => after.includes(node)),
        parity, expected,
      };
    });

    expect(result.hydration).toEqual({ adopted: true });
    expect(result.adoptedAll).toBe(true);
    expect(result.dispatched.map(commandOf)).toEqual([readJson("expected/select-first.intent.json"), { command: { component: "users", name: "refresh" }, arguments: [] }]);
    expect(result.operations[0]).toBe("hydrate");
    expect(result.operations.slice(1).length).toBeGreaterThan(0);
    expect(result.operations.slice(1).every((operation) => operation === "update")).toBe(true);
    // Keyed reconciliation kept every server element: the avatar is the server's, now showing the new state.
    expect(result.sameImg).toBe(true);
    expect(result.serverNodesKept).toBe(true);
    expect(result.parity).toEqual(result.expected);
  });

  it("on a mismatch: reports it, keeps no server node, draws afresh, and carries on as after a draw", async () => {
    // The server rendered the first snapshot; the client's state is the second.
    const { html } = await serve(initialTeam);
    const page = load(html);
    const server = page.nodes();
    const program = await compileProgram();

    const result = await inApp({ ...initialTeam, first: second.first }, async ({ team, run }) => {
      const app = composer({ container: page.container, primitives }, run);
      const hydration = await app.hydrate(application(team, program));
      const survivors = page.nodes().filter((node) => server.includes(node));
      const img = page.container.querySelector("img")!;

      page.click(img);
      await app.settled();

      // A later render is an update of the fresh draw.
      await Effect.runPromise(team.update((current) => Effect.succeed({ ...current, compact: false })));
      await until(() => img.getAttribute("data-size") === "md");
      const sameImg = page.container.querySelector("img") === img;
      await app.stop();

      return { hydration, survivors, dispatched: app.dispatched, operations: app.operations, sameImg };
    });

    expect(result.hydration).toMatchObject({ adopted: false, mismatch: { class: "attribute", expected: 'aria-label="Ada King"', found: 'aria-label="Ada Lovelace"' } });
    expect(result.survivors).toEqual([]);
    expect(result.dispatched.map(commandOf)).toEqual([{
      command: { component: "user-card", name: "selectUser" },
      arguments: [{ value: second.first }],
    }]);
    // Every later render is an update of the fresh draw (the host's renders stream may repeat the current one first).
    expect(result.operations[0]).toBe("hydrate");
    expect(result.operations.slice(1).length).toBeGreaterThan(0);
    expect(result.operations.slice(1).every((operation) => operation === "update")).toBe(true);
    expect(result.sameImg).toBe(true);
  });

  it("MESH v0.6's propText reaches server HTML exactly as it reaches the DOM", async () => {
    const users = read("users.mprx").replace("<button on.click", "<button disabled={compact} on.click");
    const table: WebPrimitives = { ...primitives, button: { ...primitives["button"]!, props: { disabled: { kind: "attribute", name: "aria-disabled" } } } };
    const { html, embedded } = await serve(initialTeam, table, users);
    const page = load(html);
    const program = await compileProgram({ users });

    const hydration = await inApp(JSON.parse(embedded) as State, async ({ team, run }) => {
      const app = composer({ container: page.container, primitives: table }, run);
      const outcome = await app.hydrate(application(team, program));
      await app.stop();

      return outcome;
    });

    expect(html).toContain('<button aria-disabled="true">Refresh</button>');
    expect(hydration).toEqual({ adopted: true });
  });
});

describe("the server entry", () => {
  it("imports and runs with no DOM at all", () => {
    const script = `
      import { realizeHtml } from "@valancex/port-web/server";
      const tree = { format: "mesh-render", version: 1, root: { type: "node", key: "k1", component: "page", props: { title: "T & t" }, events: {}, children: [{ type: "text", key: "k2", text: "hi" }] } };
      const html = realizeHtml(tree, { page: { element: "section", props: { title: { kind: "attribute", name: "aria-label" } } } });
      process.stdout.write([typeof document, typeof window, typeof Element, html].join("|"));
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], { cwd: new URL("..", import.meta.url), encoding: "utf8" });

    expect(output).toBe('undefined|undefined|undefined|<section aria-label="T &amp; t">hi</section>');
  });
});
