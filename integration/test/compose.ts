// The composer: the application code that connects NEXUS MESH hosts to a
// PORT (NEXUS docs/ARCHITECTURE.md §16; PORT docs/CONTRACT.md). It is the
// only code here that knows both. NEXUS never sees the PORT, and the PORT
// never sees NEXUS, a `Render`, an intent or a command.
//
// It owns two facts no one else has:
// - program continuity: a NEXUS MESH host renders one program, so trees from
//   the host being shown are updates, and showing another host is a new
//   program, drawn afresh. PORT is told; it never infers this.
// - the drawn render: each PORT report is dispatched with the `Render` whose
//   tree is drawn, never a newer one (NEXUS M1 and M2 leave this to it).
import type { Mesh } from "@valancex/nexus";
import type { WebPort, WebPortOptions } from "@valancex/port-web";

import { createWebPort } from "@valancex/port-web";
import { Effect, Exit, Fiber, Stream } from "effect";

export type Operation = "draw" | "update";

export interface Composer<E, R> {
  readonly port: WebPort;
  /** Shows `host`'s program: draws its current render afresh, then updates the PORT with each later render. */
  readonly show: (host: Mesh.Host<E, R>) => Promise<void>;
  /** Every PORT operation the composer asked for, in order. */
  readonly operations: Array<Operation>;
  /** Every dispatch the composer made, in order, as it settled. */
  readonly dispatched: Array<Exit.Exit<Mesh.Dispatched, Mesh.MeshDiagnostics | Mesh.UnmappedCommand | E>>;
  /** Resolves when every dispatch made so far has settled. */
  readonly settled: () => Promise<void>;
  /** Stops following renders, and unmounts the PORT. */
  readonly stop: () => Promise<void>;
}

/** `run` runs a dispatch where its commands' requirements are provided. */
export const composer = <E, R>(
  options: Omit<WebPortOptions, "report">,
  run: <A, F>(effect: Effect.Effect<A, F, R>) => Promise<Exit.Exit<A, F>>
): Composer<E, R> => {
  // The host whose program is drawn, and the render whose tree is drawn.
  let shown: { readonly host: Mesh.Host<E, R>; render: Mesh.Render } | undefined;
  let following: Fiber.RuntimeFiber<void, Mesh.MeshDiagnostics> | undefined;
  const pending: Array<Promise<unknown>> = [];
  const operations: Array<Operation> = [];
  const dispatched: Composer<E, R>["dispatched"] = [];

  const port = createWebPort({
    ...options,
    report: (handler, payload) => {
      // The render the user saw when the event fired, never a newer one.
      const { host, render } = shown!;
      pending.push(run(host.dispatch(render, handler, payload)).then((exit) => { dispatched.push(exit); }));
    },
  });

  const stopFollowing = async (): Promise<void> => {
    if (following !== undefined) {
      await Effect.runPromise(Fiber.interrupt(following));
      following = undefined;
    }
  };

  return {
    port,
    operations,
    dispatched,

    show: async (host) => {
      await stopFollowing();

      // A different host is a different program: draw afresh. The composer knows because it made the switch.
      const render = await Effect.runPromise(host.render);
      port.draw(render.tree);
      operations.push("draw");
      shown = { host, render };

      // Every later render of this host is the same program: update.
      following = Effect.runFork(Stream.runForEach(host.renders, (later) => Effect.sync(() => {
        port.update(later.tree);
        operations.push("update");
        shown!.render = later;
      })));
    },

    settled: async () => {
      while (pending.length > 0) {
        await Promise.all(pending.splice(0));
      }
    },

    stop: async () => {
      await stopFollowing();
      port.unmount();
    },
  };
};
