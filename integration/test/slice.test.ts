// The Valance vertical slice, every step real:
//
//   MPRX → MESH compiler → template-v1 → MESH runtime → render-v1
//        → NEXUS (Mesh.host, state, commands) → composer → PORT Web → DOM
//
// and back: DOM event → PORT Web → (handler, payload) → composer
//        → NEXUS dispatch → command intent → NEXUS command → state → new render.
//
// MESH's slice (fixtures/mesh-slice) is compiled with the published
// @valancex/mesh-compiler, rendered by the published @valancex/mesh-runtime
// inside the published @valancex/nexus, and drawn by this repository's PORT.
import * as Nexus from "@valancex/nexus";
import { Chunk, Effect, Exit, Fiber, Layer, Option, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { Team, UserSelected, application, compileProgram, dom, expectedFirstHtml, initialTeam, primitives, readJson, until } from "./app.js";
import { composer } from "./compose.js";

describe("MPRX → MESH → NEXUS → PORT Web → DOM", () => {
  it("renders, reacts to the user, and updates in place, with every layer real", async () => {
    const program = await compileProgram();
    const { container, click } = dom();

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "port-slice", runtime: Layer.empty }));
      const team = yield* Nexus.Application.createState(running, Team, initialTeam);
      const run = <A, F>(effect: Effect.Effect<A, F, Nexus.Event.EventBusShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
      const published = Nexus.Runtime.runFork(running.runtime, Stream.runCollect(Stream.take(Nexus.Event.subscribe(UserSelected), 1)));
      yield* Effect.sleep("1 millis");

      const app = composer({ container, primitives }, run);
      yield* Effect.promise(() => app.show(application(team, program)));

      // 1. Real semantic data reached PORT, and became DOM.
      const drawnHtml = container.innerHTML;
      const img = container.querySelector("img")!;

      // 2. The user clicks Ada's avatar: DOM event → PORT → (handler, payload) → NEXUS → users.select.
      click(img, 1, 2);
      yield* Effect.promise(app.settled);
      const selected = yield* team.get;

      // 3. The user clicks Refresh: users.refresh changes state; NEXUS renders; PORT updates in place.
      click(container.querySelector("button")!);
      yield* Effect.promise(app.settled);
      yield* Effect.promise(() => until(() => container.querySelector("img")!.getAttribute("src") === "ada-2.png"));
      const updatedHtml = container.innerHTML;
      const sameImg = container.querySelector("img") === img;

      const events = yield* Fiber.join(published);
      yield* Effect.promise(app.stop);
      yield* Nexus.Application.shutdown(running);

      return { drawnHtml, updatedHtml, sameImg, selected, events: Chunk.toReadonlyArray(events), dispatched: app.dispatched, after: container.innerHTML };
    })));

    expect(result.drawnHtml).toBe(expectedFirstHtml);

    // The intent is exactly MESH's reviewed one: PORT's report carried the right handler, with the drawn render.
    expect(result.dispatched).toHaveLength(2);
    const [select, refresh] = result.dispatched.map((exit) => Exit.getOrElse(exit, (cause) => { throw new Error(String(cause)); }));
    expect(select!.intent).toEqual(readJson("expected/select-first.intent.json"));
    expect(refresh!.intent.command).toEqual({ component: "users", name: "refresh" });
    expect(result.selected.selectedUserId).toEqual(Option.some("u1"));
    expect(result.events).toEqual([{ userId: "u1" }]);

    // The update changed exactly what MESH says, in place: the same <img>.
    expect(result.sameImg).toBe(true);
    expect(result.updatedHtml).toBe(expectedFirstHtml
      .replace('aria-label="Ada Lovelace"', 'aria-label="Ada King"')
      .replace('alt="Ada Lovelace" data-size="sm" src="ada.png"', 'alt="Ada King" data-size="sm" src="ada-2.png"')
      .replace("<span>Ada Lovelace</span>", "<span>Ada King</span>"));
    expect(result.after).toBe("");
  });
});
