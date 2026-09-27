// The composer's two obligations (docs/CONTRACT.md), with real MESH and
// NEXUS: it keeps the drawn render and dispatches every report with it,
// and it alone decides program continuity, drawing afresh when the program
// changes and updating otherwise.
import type { RenderNode, RenderTree } from "@valancex/mesh-runtime";

import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect, it } from "vitest";

import { Team, application, compileProgram, dom, domNodes, initialTeam, primitives, read, until } from "./app.js";
import { composer } from "./compose.js";

const nodesOf = (root: RenderNode): ReadonlyArray<RenderNode> => [root, ...root.children.flatMap((child) => child.type === "node" ? nodesOf(child) : [])];
const buttonHandler = (tree: RenderTree): string => nodesOf(tree.root).find((node) => node.component === "button")!.events["click"]!;
const userNameOf = (exit: Exit.Exit<Nexus.Mesh.Dispatched, unknown>): unknown =>
  Exit.isSuccess(exit) ? (exit.value.intent.arguments[0] as { readonly value: { readonly name: string } }).value.name : Cause.pretty(exit.cause);

// Runs `body` in a started application with the slice's state, and shuts it down.
const inApp = <A>(body: (context: {
  readonly team: Nexus.State.StateHandle<Team>;
  readonly run: <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Promise<Exit.Exit<X, F>>;
}) => Promise<A>): Promise<A> => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "port-composer", runtime: Layer.empty }));
  const team = yield* Nexus.Application.createState(running, Team, initialTeam);
  const run = <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
  const result = yield* Effect.promise(() => body({ team, run }));
  yield* Nexus.Application.shutdown(running);

  return result;
})));

describe("the composer keeps the drawn render", () => {
  it("dispatches each report with the render whose tree was drawn when the event fired", async () => {
    const program = await compileProgram();
    const { container, click } = dom();

    const { names, operations } = await inApp(async ({ team, run }) => {
      const app = composer({ container, primitives }, run);
      await app.show(application(team, program));

      // Drawn: Ada Lovelace. The intent carries the drawn render's value.
      click(container.querySelector("img")!);
      await app.settled();

      // Refresh: the state moves on, and the next render (Ada King) is drawn by update.
      click(container.querySelector("button")!);
      await app.settled();
      await until(() => container.querySelector("img")!.getAttribute("alt") === "Ada King");

      // The same avatar, now drawn from the newer render: its intent carries the newer value.
      click(container.querySelector("img")!);
      await app.settled();
      await app.stop();

      return { names: [app.dispatched[0]!, app.dispatched[2]!].map(userNameOf), operations: app.operations };
    });

    expect(names).toEqual(["Ada Lovelace", "Ada King"]);
    expect(operations[0]).toBe("draw");
    expect(operations.slice(1).every((operation) => operation === "update")).toBe(true);
  });
});

describe("the composer decides program continuity", () => {
  it("draws a new program afresh, and dispatches its events with its own render", async () => {
    const slice = await compileProgram();
    // The same components, one template changed: a different program.
    const reloaded = await compileProgram({ users: read("users.mprx").replace("Refresh", "Reload") });
    const { container, click } = dom();

    const result = await inApp(async ({ team, run }) => {
      const app = composer({ container, primitives }, run);
      const before = application(team, slice);
      await app.show(before);
      const drawnNodes = new Set(domNodes(container.firstChild!));
      const oldRender = await Effect.runPromise(before.render);

      const after = application(team, reloaded);
      const newTree = (await Effect.runPromise(after.render)).tree;
      await app.show(after);
      const reused = domNodes(container.firstChild!).filter((node) => drawnNodes.has(node));

      // Why the composer must pair each report with the render that drew it:
      // the new program's handler, dispatched with the old program's render, is refused.
      const mismatched = await run(before.dispatch(oldRender, buttonHandler(newTree)));

      const label = container.querySelector("button")!.textContent;
      click(container.querySelector("button")!);
      await app.settled();
      await app.stop();

      return { reused, mismatched, label, dispatched: app.dispatched, operations: app.operations };
    });

    expect(result.operations.filter((operation) => operation === "draw")).toHaveLength(2);
    expect(result.label).toBe("Reload");
    expect(result.reused).toEqual([]);
    expect(Exit.isFailure(result.mismatched) && Option.getOrUndefined(Cause.failureOption(result.mismatched.cause))).toMatchObject({
      _tag: "MeshDiagnostics",
      diagnostics: { diagnostics: [{ code: "runtime-handler-other-program" }] },
    });
    expect(result.dispatched).toHaveLength(1);
    expect(Exit.isSuccess(result.dispatched[0]!) && result.dispatched[0].value.intent.command).toEqual({ component: "users", name: "refresh" });
  });
});
