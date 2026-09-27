// The composer: the application code that connects a NEXUS MESH host to a
// PORT (NEXUS docs/ARCHITECTURE.md §16; PORT docs/CONTRACT.md). It is the
// only code here that knows both. NEXUS never sees the PORT, and the PORT
// never sees NEXUS, a `Render`, an intent or a command.
import type { Mesh } from "@valancex/nexus";
import type { WebPort, WebPortOptions } from "@valancex/port-web";

import { createWebPort } from "@valancex/port-web";
import { Effect, Exit, Fiber, Stream } from "effect";

export interface Composed<E> {
  readonly port: WebPort;
  /** Every dispatch the composer has made, in order, as it settled. */
  readonly dispatched: Array<Exit.Exit<Mesh.Dispatched, Mesh.MeshDiagnostics | Mesh.UnmappedCommand | E>>;
  /** Resolves when every dispatch made so far has settled. */
  readonly settled: () => Promise<void>;
  /** Stops following renders, and unmounts the PORT. */
  readonly stop: () => Promise<void>;
}

/**
 * Draws the host's current render, updates the PORT with each later render
 * (all from one program), and dispatches each PORT report with the render
 * whose tree is drawn: the host's obligation M1/M2 leaves to its caller.
 * `run` runs a dispatch where the commands' requirements are provided.
 */
export const compose = async <E, R>(
  host: Mesh.Host<E, R>,
  options: Omit<WebPortOptions, "report">,
  run: <A, F>(effect: Effect.Effect<A, F, R>) => Promise<Exit.Exit<A, F>>
): Promise<Composed<E>> => {
  let drawn: Mesh.Render | undefined;
  const pending: Array<Promise<unknown>> = [];
  const dispatched: Composed<E>["dispatched"] = [];

  const port = createWebPort({
    ...options,
    report: (handler, payload) => {
      // The render the user saw when the event fired, never a newer one.
      const render = drawn!;
      pending.push(run(host.dispatch(render, handler, payload)).then((exit) => { dispatched.push(exit); }));
    },
  });

  drawn = await Effect.runPromise(host.render);
  port.draw(drawn.tree);

  // One program throughout, so every later tree is an update.
  const following = Effect.runFork(Stream.runForEach(host.renders, (render) => Effect.sync(() => {
    port.update(render.tree);
    drawn = render;
  })));

  return {
    port,
    dispatched,
    settled: async () => {
      while (pending.length > 0) {
        await Promise.all(pending.splice(0));
      }
    },
    stop: async () => {
      await Effect.runPromise(Fiber.interrupt(following));
      port.unmount();
    },
  };
};
