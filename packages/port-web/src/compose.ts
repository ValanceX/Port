/**
 * The composer helper (Tier 1): drives a Web PORT from a Mesh screen (`openScreen` in `@valancex/mesh-runtime`), so the
 * caller shows snapshots and receives intents, and never chooses `draw` or `patch`, nor releases a render. The screen is
 * an argument and its shape is described here, so this module imports nothing from Mesh at run time. The PORT's own
 * `draw`, `patch` and `report` (Tier 2) are unchanged.
 */

import { createWebPort } from "./port.js";
import type { RenderPatches, WebPort, WebPortOptions } from "./port.js";

/** What the composer needs of a Mesh `Screen`: its `show` and `dispatch`, and the results it gives. */
export interface ComposedScreen<Tree = Parameters<WebPort["draw"]>[0], Intent = unknown, Diagnostics = unknown> {
  show(snapshot: Record<string, unknown>): Promise<{ readonly tree?: Tree; readonly patches?: RenderPatches; readonly diagnostics?: Diagnostics }>;
  dispatch(handler: string, payload?: unknown): Promise<{ readonly intent?: Intent; readonly patches?: RenderPatches; readonly diagnostics?: Diagnostics }>;
  close(): void;
}

/** The PORT's options (primitives and `native` included) but `report`, which the composer owns. */
export interface ComposeOptions<Intent = unknown, Diagnostics = unknown> extends Omit<WebPortOptions, "report"> {
  readonly screen: ComposedScreen<WebPortTree, Intent, Diagnostics>;
  /** Called with the intent of each command an interaction dispatched, for the application to run. */
  readonly onIntent: (intent: Intent) => void;
  /** Called with the diagnostics an interaction's dispatch gave (a `show` gives its own back). Absent: they are dropped. */
  readonly onDiagnostics?: (diagnostics: Diagnostics) => void;
  /**
   * Called when an interaction's dispatch rejects, or its result can't be applied to the PORT. Absent: the error is reported as an uncaught one (`reportError`, else thrown from a microtask).
   * If this callback itself throws, that rejection is unhandled: it is the caller's last line.
   */
  readonly onError?: (error: unknown) => void;
}

type WebPortTree = Parameters<WebPort["draw"]>[0];

export interface WebComposer<Diagnostics = unknown> {
  /** Shows `snapshot`: the first one draws, later ones patch in place. Gives the diagnostics if the screen refused it (nothing changes), else nothing. */
  show(snapshot: Record<string, unknown>): Promise<{ readonly diagnostics: Diagnostics } | { readonly diagnostics?: undefined }>;
  /** Empties the container and closes the screen. Safe to call twice; `show` draws afresh after it. */
  close(): void;
  [Symbol.dispose]?(): void;
}

// ponytail: `reportError` where the platform has it (browsers, Node 22+), else a throw from a microtask; both surface as uncaught errors.
declare const reportError: ((error: unknown) => void) | undefined;
const reportUncaught = (error: unknown): void => {
  if (typeof reportError === "function") {
    reportError(error);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
};

export const composeWebPort = <Intent = unknown, Diagnostics = unknown>({ screen, onIntent, onDiagnostics, onError = reportUncaught, ...options }: ComposeOptions<Intent, Diagnostics>): WebComposer<Diagnostics> => {
  // Every show and every report runs on one chain: the screen dispatches with the render whose result it handed out last, so each result
  // is applied to the PORT before the next call (or the dispatch of the next report) begins.
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(call: () => Promise<T>): Promise<T> => {
    const result = chain.then(call);

    chain = result.catch(() => undefined);

    return result;
  };
  // `screen` and the DOM must agree: if the PORT can't take what the screen gave, both are ended, so the next `show` draws afresh, and the error goes on.
  const applying = (apply: () => void): void => {
    try {
      apply();
    } catch (error) {
      port.unmount();
      screen.close();

      throw error;
    }
  };
  const port = createWebPort({
    ...options,
    report: (handler, payload) => {
      void enqueue(async () => {
        const result = await screen.dispatch(handler, payload);

        if (result.diagnostics !== undefined) {
          onDiagnostics?.(result.diagnostics);

          return;
        }

        // A unit's change is drawn first; the intent it raised, if any, is the application's after that.
        if (result.patches !== undefined) {
          const patches = result.patches;

          applying(() => port.patch(patches));
        }

        if (result.intent !== undefined) {
          onIntent(result.intent);
        }
      }).catch(onError);
    },
  });
  const composer: WebComposer<Diagnostics> = {
    show: (snapshot) =>
      enqueue(async () => {
        const result = await screen.show(snapshot);

        if (result.diagnostics !== undefined) {
          return { diagnostics: result.diagnostics };
        }

        const { tree, patches } = result;

        applying(() => {
          if (tree !== undefined) {
            port.draw(tree);
          } else if (patches !== undefined) {
            port.patch(patches);
          }
        });

        return {};
      }),
    close: () => {
      port.unmount();
      screen.close();
    },
  };

  if (typeof Symbol.dispose === "symbol") {
    composer[Symbol.dispose] = composer.close;
  }

  return composer;
};
