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
import type { HydrationResult, WebPort, WebPortOptions } from "@valancex/port-web";

import { createWebPort } from "@valancex/port-web";
import { Effect, Exit, Fiber, Stream } from "effect";

export type Operation = "draw" | "hydrate" | "update";

export interface Composer<E, R> {
  readonly port: WebPort;
  /** Shows `host`'s program: draws its current render afresh, then updates the PORT with each later render. */
  readonly show: (host: Mesh.Host<E, R>) => Promise<void>;
  /**
   * Takes over server HTML of `host`'s program: hydrates the PORT with the
   * client host's own current render, which the composer retains, then
   * updates the PORT with each later render. The server's render never
   * reaches the client: the client render is the source of handler
   * identifiers, bindings, values and program continuity.
   */
  readonly hydrate: (host: Mesh.Host<E, R>) => Promise<HydrationResult>;
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

  // Every later render of the shown host is the same program: update.
  const follow = (host: Mesh.Host<E, R>): void => {
    following = Effect.runFork(Stream.runForEach(host.renders, (later) => Effect.sync(() => {
      port.update(later.tree);
      operations.push("update");
      shown!.render = later;
    })));
  };

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
      follow(host);
    },

    hydrate: async (host) => {
      await stopFollowing();

      // The client's render, never the server's. Hydrating with it and
      // retaining it happen in one synchronous step, so no interaction can
      // be reported in between. On a mismatch the PORT has drawn this tree
      // afresh, and the same render is the drawn one.
      const render = await Effect.runPromise(host.render);
      const result = port.hydrate(render.tree);
      operations.push("hydrate");
      shown = { host, render };
      follow(host);

      return result;
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
