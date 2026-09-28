// MESH v0.6 through the whole slice: the runtime inside NEXUS's host is
// v0.6, its propText reaches the DOM through PORT's text-only slots, a value
// no slot can hold is refused before the DOM changes, and nested bindings
// resolve to one binding, and so one intent and one command, per click.
//
// MESH's slice has no non-string prop and no nested bindings, so these use
// variants of its `users` template, compiled against its manifest.
import type { WebPrimitives } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import { WebRealizationError, attribute, property } from "@valancex/port-web";
import { Effect, Exit, Layer } from "effect";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

import { Team, application, compileProgram, dom, initialTeam, primitives, read, until } from "./app.js";
import { composer } from "./compose.js";

// Runs `body` in a started application with the slice's state, and shuts it down.
const inApp = <A>(body: (context: {
  readonly team: Nexus.State.StateHandle<Team>;
  readonly run: <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Promise<Exit.Exit<X, F>>;
}) => Promise<A>): Promise<A> => Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "port-mesh-v06", runtime: Layer.empty }));
  const team = yield* Nexus.Application.createState(running, Team, initialTeam);
  const run = <X, F>(effect: Effect.Effect<X, F, Nexus.Event.EventBusShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
  const result = yield* Effect.promise(() => body({ team, run }));
  yield* Nexus.Application.shutdown(running);

  return result;
})));

const commandsOf = (dispatched: ReadonlyArray<Exit.Exit<Nexus.Mesh.Dispatched, unknown>>) =>
  dispatched.map((exit) => Exit.isSuccess(exit) ? `${exit.value.intent.command.component}/${exit.value.intent.command.name}` : "failed");

describe("the slice runs on MESH v0.6", () => {
  it("NEXUS's host renders with the one mesh-runtime the slice uses, and it is v0.6", () => {
    const fromNexus = createRequire(createRequire(import.meta.url).resolve("@valancex/nexus")).resolve("@valancex/mesh-runtime/package.json");
    const fromSlice = createRequire(import.meta.url).resolve("@valancex/mesh-runtime/package.json");

    expect(realpathSync(fromNexus)).toBe(realpathSync(fromSlice));
    expect((createRequire(import.meta.url)(fromSlice) as { readonly version: string }).version).toMatch(/^0\.6\./);
  });
});

describe("propText, from MESH's runtime inside NEXUS, to the DOM", () => {
  // The button's boolean `disabled`, bound to state, and realized in a
  // text-only slot: the enumerated ARIA attribute, whose text is MESH's.
  const users = read("users.mprx").replace("<button on.click", "<button disabled={compact} on.click");
  const ariaPrimitives: WebPrimitives = { ...primitives, button: { ...primitives["button"]!, props: { disabled: attribute("aria-disabled") } } };

  it("a boolean prop's text is MESH's propText, and an update writes the new text in place", async () => {
    const program = await compileProgram({ users });
    const { container } = dom();

    const result = await inApp(async ({ team, run }) => {
      const app = composer({ container, primitives: ariaPrimitives }, run);
      const host = application(team, program);
      const tree = (await Effect.runPromise(host.render)).tree;
      await app.show(host);
      const button = container.querySelector("button")!;
      const drawn = button.getAttribute("aria-disabled");

      await Effect.runPromise(team.update((current) => Effect.succeed({ ...current, compact: false })));
      await until(() => container.querySelector("button")!.getAttribute("aria-disabled") !== drawn);
      const updated = { same: container.querySelector("button") === button, text: button.getAttribute("aria-disabled") };
      await app.stop();

      return { tree, drawn, updated };
    });

    const node = result.tree.root.children.find((child) => child.type === "node" && child.component === "button");
    expect(node).toMatchObject({ props: { disabled: true }, propText: { disabled: "true" } });
    expect(result.drawn).toBe("true");
    expect(result.updated).toEqual({ same: true, text: "false" });
  });

  it("a value no slot of its primitive can hold is refused, and nothing is drawn", async () => {
    const program = await compileProgram({ users });
    const { container } = dom();
    // A realization table that puts the boolean in a property holding numbers.
    const wrong: WebPrimitives = { ...primitives, button: { ...primitives["button"]!, props: { disabled: property("valanceLevel", "number") } } };

    const refused = await inApp(async ({ team, run }) => {
      const app = composer({ container, primitives: wrong }, run);

      try {
        await app.show(application(team, program));
      } catch (error) {
        return error;
      }

      return undefined;
    });

    expect(refused).toBeInstanceOf(WebRealizationError);
    expect(refused).toMatchObject({ code: "unrealizable-value" });
    expect(container.childNodes).toHaveLength(0);
  });
});

describe("event resolution, from a DOM click to one NEXUS command", () => {
  // The first user's card inside the Refresh button: the avatar's click
  // binding is inside the button's.
  const users = read("users.mprx")
    .replace("  <user-card user={first} compact={compact} />\n", "")
    .replace("<button on.click={refresh()}>Refresh</button>", "<button on.click={refresh()}><user-card user={first} compact={compact} /></button>");

  it("the inner binding wins, an interaction on unbound content reaches the ancestor, and each click is one command", async () => {
    const program = await compileProgram({ users });
    const { container, click } = dom();

    const result = await inApp(async ({ team, run }) => {
      const app = composer({ container, primitives }, run);
      await app.show(application(team, program));
      const button = container.querySelector("button")!;

      // The avatar: its own click binding, and not the button's.
      click(button.querySelector("img")!);
      await app.settled();
      const afterAvatar = commandsOf(app.dispatched);

      // The name inside the button binds nothing: the button receives it.
      click(button.querySelector("span")!);
      await app.settled();
      const afterName = commandsOf(app.dispatched);
      await app.stop();

      return { afterAvatar, afterName };
    });

    expect(result.afterAvatar).toEqual(["user-card/selectUser"]);
    expect(result.afterName).toEqual(["user-card/selectUser", "users/refresh"]);
  });
});
