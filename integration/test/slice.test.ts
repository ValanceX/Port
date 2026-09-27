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
import type { WebPrimitives } from "@valancex/port-web";

import { compile } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import { attribute, booleanAttribute } from "@valancex/port-web";
import { Chunk, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

import { compose } from "./compose.js";

const fixture = new URL("../../fixtures/mesh-slice/", import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, fixture), "utf8");
const readJson = (path: string): unknown => JSON.parse(read(path));
const model = read("components.json");

// ---------------------------------------------------------------------------
// Build time: MPRX → template-v1, with the real compiler.

let program: Nexus.Mesh.Program;

beforeAll(async () => {
  const templateOf = async (component: string): Promise<string> => {
    const result = await compile({ source: read(`${component}.mprx`), path: `${component}.mprx`, model: { manifest: model, path: "components.json", component } });

    if (result.template === undefined) {
      throw new Error(`${component} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
    }

    return JSON.stringify(result.template);
  };

  program = { root: "users", templates: [await templateOf("users"), await templateOf("user-card")], model };
});

// ---------------------------------------------------------------------------
// The application, in NEXUS: state, the scope MESH renders, and commands.

const User = Schema.Struct({ id: Schema.String, name: Schema.String, avatar: Schema.optional(Schema.String), active: Schema.Boolean });
const Team = Schema.Struct({ title: Schema.String, first: User, second: User, compact: Schema.Boolean, selectedUserId: Schema.OptionFromSelf(Schema.String) });
type Team = Schema.Schema.Type<typeof Team>;

const Snapshot = Schema.Struct({ title: Schema.String, first: User, second: User, compact: Schema.Boolean });
const first = Schema.decodeUnknownSync(Snapshot)(readJson("snapshots/first.json"));
const second = Schema.decodeUnknownSync(Snapshot)(readJson("snapshots/second.json"));

const UserSelected = Nexus.Event.define("UserSelected", Schema.Struct({ userId: Schema.String }));

const application = (team: Nexus.State.StateHandle<Team>) => {
  const select = Nexus.Command.define("users.select", Schema.Struct({ userId: Schema.String }), ({ userId }) =>
    team.update((current) => Effect.succeed({ ...current, selectedUserId: Option.some(userId) })).pipe(Effect.andThen(() => Nexus.Event.publish(UserSelected, { userId }))));
  // Stands in for a reload: the first user becomes second.json's Ada King.
  const refresh = Nexus.Command.define("users.refresh", Schema.Struct({}), () =>
    team.update((current) => Effect.succeed({ ...current, first: second.first })).pipe(Effect.asVoid));

  return Nexus.Mesh.host({
    program,
    scope: Nexus.Selector.define(team, ({ title, first, second, compact }): Record<string, unknown> => ({ title, first, second, compact })),
    // The only way an intent reaches behavior: explicit, NEXUS-side bindings.
    commands: {
      "user-card/selectUser": Nexus.Mesh.bind(select, (args) => ({ userId: (args[0] as { readonly value: { readonly id: string } }).value.id })),
      "users/refresh": Nexus.Mesh.bind(refresh, () => ({})),
    },
  });
};

// ---------------------------------------------------------------------------
// The Web realization of the slice's primitives: PORT Web configuration.

const primitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  avatar: {
    element: "img",
    props: { src: attribute("src"), alt: attribute("alt"), size: attribute("data-size") },
    events: { click: { type: "click", payload: (event) => ({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }) } },
  },
  button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
};

// Waits, boundedly, for the DOM to reach a condition that a background render produces.
const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 200) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("MPRX → MESH → NEXUS → PORT Web → DOM", () => {
  it("renders, reacts to the user, and updates in place, with every layer real", async () => {
    const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>");
    const container = window.document.querySelector("main")!;
    const click = (target: Element, x = 0, y = 0) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "port-slice", runtime: Layer.empty }));
      const team = yield* Nexus.Application.createState(running, Team, { ...first, selectedUserId: Option.none() });
      const host = application(team);
      const run = <A, F>(effect: Effect.Effect<A, F, Nexus.Event.EventBusShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
      const published = Nexus.Runtime.runFork(running.runtime, Stream.runCollect(Stream.take(Nexus.Event.subscribe(UserSelected), 1)));
      yield* Effect.sleep("1 millis");

      const app = yield* Effect.promise(() => compose(host, { container, primitives }, run));

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

    expect(result.drawnHtml).toBe(
      '<section aria-label="Team">'
      + '<section aria-label="Ada Lovelace"><img alt="Ada Lovelace" data-size="sm" src="ada.png"><span>Ada Lovelace</span></section>'
      + '<section aria-label="Grace Hopper"><img alt="Grace Hopper" data-size="md"><span>Grace Hopper (inactive)</span></section>'
      + "<button>Refresh</button>"
      + "</section>");

    // The intent is exactly MESH's reviewed one: PORT's report carried the right handler, with the drawn render.
    expect(result.dispatched).toHaveLength(2);
    const [select, refresh] = result.dispatched.map((exit) => Exit.getOrElse(exit, (cause) => { throw new Error(String(cause)); }));
    expect(select!.intent).toEqual(readJson("expected/select-first.intent.json"));
    expect(refresh!.intent.command).toEqual({ component: "users", name: "refresh" });
    expect(result.selected.selectedUserId).toEqual(Option.some("u1"));
    expect(result.events).toEqual([{ userId: "u1" }]);

    // The update changed exactly what MESH says, in place: the same <img>.
    expect(result.sameImg).toBe(true);
    expect(result.updatedHtml).toBe(result.drawnHtml
      .replace('aria-label="Ada Lovelace"', 'aria-label="Ada King"')
      .replace('alt="Ada Lovelace" data-size="sm" src="ada.png"', 'alt="Ada King" data-size="sm" src="ada-2.png"')
      .replace("<span>Ada Lovelace</span>", "<span>Ada King</span>"));
    expect(result.after).toBe("");
  });
});
