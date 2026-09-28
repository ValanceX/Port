// The Valance tracer bullet, in Chromium (NEXUS v0.9 outline §8):
//
//   MPRX ─(mesh-compiler, build time, Node: ./setup.ts)─▶ template-v1
//     ─▶ @valancex/mesh-runtime (WebAssembly, init() in this page) ─▶ render-v1
//     ─▶ NEXUS Application (state; users.select; users.refresh, which requires UsersSource)
//     ─▶ a test platform (Layer.merge: UsersSource and Clock = 42, the shape that exposed P1)
//     ─▶ the composer (../test/compose.ts, unchanged) ─▶ @valancex/port-web ─▶ Chromium's DOM
//
// and back, from a real click through Chromium's input pipeline. Everything is
// the published package or this repository's PORT; the platform and the one
// capability are local to this test. Nothing here is a Valance API.
import type { WebPrimitives } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import { attribute, booleanAttribute } from "@valancex/port-web";
import { userEvent } from "@vitest/browser/context";
import { Chunk, Clock, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { composer } from "../test/compose.js";

const slice = inject("slice");
const program: Nexus.Mesh.Program = slice.program;

// ---------------------------------------------------------------------------
// The application: the slice's NEXUS side, as in ../test/app.ts, except that
// users.refresh gets its user from one capability instead of a constant.

const User = Schema.Struct({ id: Schema.String, name: Schema.String, avatar: Schema.optional(Schema.String), active: Schema.Boolean });
type User = Schema.Schema.Type<typeof User>;
const Snapshot = Schema.Struct({ title: Schema.String, first: User, second: User, compact: Schema.Boolean });
const Team = Schema.Struct({ ...Snapshot.fields, selectedUserId: Schema.OptionFromSelf(Schema.String) });
type Team = Schema.Schema.Type<typeof Team>;

const first = Schema.decodeUnknownSync(Snapshot)(slice.snapshots.first);
const second = Schema.decodeUnknownSync(Snapshot)(slice.snapshots.second);
const initialTeam: Team = { ...first, selectedUserId: Option.none() };

const UserSelected = Nexus.Event.define("UserSelected", Schema.Struct({ userId: Schema.String }));

/** The one capability: where the application reloads its users from. */
const UsersSource = Nexus.Capability.define<{ readonly reload: Effect.Effect<User> }>("slice.users-source");

/** The Clock times application code observed, as it ran. */
type Seen = { readonly clocks: Array<number> };

const application = (team: Nexus.State.StateHandle<Team>, seen: Seen) => {
  const observeClock = Effect.flatMap(Clock.currentTimeMillis, (t) => Effect.sync(() => { seen.clocks.push(t); }));
  const select = Nexus.Command.define("users.select", Schema.Struct({ userId: Schema.String }), ({ userId }) =>
    team.update((current) => Effect.succeed({ ...current, selectedUserId: Option.some(userId) })).pipe(
      Effect.andThen(() => Nexus.Event.publish(UserSelected, { userId })),
      Effect.tap(() => observeClock)
    ));
  const refresh = Nexus.Command.define("users.refresh", Schema.Struct({}), () =>
    Nexus.Capability.require(UsersSource).pipe(
      Effect.flatMap((source) => source.reload),
      Effect.tap(() => observeClock),
      Effect.flatMap((user) => team.update((current) => Effect.succeed({ ...current, first: user }))),
      Effect.asVoid
    ));

  // One command needs a capability, so the host's requirements are the event bus and the environment,
  // both of which the application runtime provides.
  return Nexus.Mesh.host<Nexus.Command.CommandValidationError | Nexus.Capability.CapabilityUnavailableError, Nexus.Event.EventBusShape | Nexus.Capability.EnvironmentShape>({
    program,
    scope: Nexus.Selector.define(team, ({ title, first, second, compact }): Record<string, unknown> => ({ title, first, second, compact })),
    commands: {
      "user-card/selectUser": Nexus.Mesh.bind(select, (args) => ({ userId: (args[0] as { readonly value: { readonly id: string } }).value.id })),
      "users/refresh": Nexus.Mesh.bind(refresh, () => ({})),
    },
  });
};

/** Each unit's requirement (NEXUS v0.8 application semantics): one standalone declaration per unit. */
const declarations: ReadonlyArray<Nexus.Semantic.Declaration> = [
  { id: "start", requirements: { completeness: "complete", capabilities: [] } },
  { id: "users.select", requirements: { completeness: "complete", capabilities: [] } },
  { id: "users.refresh", requirements: { completeness: "complete", capabilities: [{ capability: UsersSource.id }] } },
];

/** The Web realization of the slice's primitives (as ../test/app.ts). */
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

// ---------------------------------------------------------------------------
// The test platform: local to this file, in the Layer.merge shape of NEXUS's
// reference platform, the shape that exposed P1.

// A complete Clock (sleep included) that reads `n`. A spread of Clock.make() would drop its prototype's methods.
const fixed = (n: number): Clock.Clock => {
  const base = Clock.make();

  return Object.assign(Object.create(Object.getPrototypeOf(base) as object) as Clock.Clock, base, { currentTimeMillis: Effect.succeed(n), unsafeCurrentTimeMillis: () => n });
};

const testPlatform = (provides: boolean) => {
  const reloads = { count: 0 };
  const resolutions = new Map<string, Nexus.Capability.CapabilityResolution<unknown>>(provides
    ? [[UsersSource.id, { _tag: "Available", implementation: { reload: Effect.sync(() => { reloads.count += 1; return second.first; }) } }]]
    : []);
  const platform: Nexus.Application.Platform = Layer.merge(Nexus.Capability.EnvironmentLive(resolutions), Layer.setClock(fixed(42)));
  const statement = { name: "browser-slice-test-platform", provided: provides ? [UsersSource.id] : [], notProvided: provides ? [] : [UsersSource.id] };

  return { platform, statement, reloads };
};

/** NEXUS's platform conformance rule (its tests/platform/conformance.ts, C21), through the public API. */
const conformance = (platform: Nexus.Application.Platform, statement: { readonly provided: ReadonlyArray<string>; readonly notProvided: ReadonlyArray<string> }) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "conformance", runtime: Layer.empty }), { platform });
    const resolve = (id: string) => Effect.promise(() => Nexus.Runtime.run(running.runtime, Nexus.Capability.resolve(Nexus.Capability.define<unknown>(id))));
    const failures: Array<string> = [];
    for (const id of statement.provided) if ((yield* resolve(id))._tag === "Unavailable") failures.push(`provided but unavailable: ${id}`);
    for (const id of statement.notProvided) if ((yield* resolve(id))._tag === "Available") failures.push(`not provided but available: ${id}`);
    yield* Nexus.Application.shutdown(running);

    return failures;
  })));

// ---------------------------------------------------------------------------
// The page.

const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const mount = (): HTMLElement => {
  const container = document.createElement("main");
  document.body.replaceChildren(container);

  return container;
};

const callerSees42 = Effect.map(Clock.currentTimeMillis, (t) => t === 42);

type Dispatch = Exit.Exit<Nexus.Mesh.Dispatched, unknown>;
const intentOf = (exit: Dispatch | undefined) => exit !== undefined && Exit.isSuccess(exit) ? exit.value.intent : undefined;
const failureOf = (exit: Dispatch | undefined) => exit !== undefined && Exit.isFailure(exit) ? Exit.match(exit, { onFailure: (cause) => cause, onSuccess: () => undefined }) : undefined;

beforeAll(async () => {
  // A broken image has no size of its own; give avatars one so a real pointer can hit them.
  const style = document.createElement("style");
  style.textContent = "img { display: inline-block; width: 32px; height: 32px; }";
  document.head.append(style);
  // MESH's engine, loaded as a page loads it: by URL, once, before the first render.
  await init(new URL(wasmUrl, location.href));
});

describe("Chromium: MPRX → MESH → NEXUS (+ UsersSource) → test platform → composer → PORT Web", () => {
  it("runs the environment: a real page, not Node", () => {
    expect(navigator.userAgent).toContain("Chrome");
    expect(typeof (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node).not.toBe("string");
  });

  it("positive: a real click reaches NEXUS, the capability is resolved, and PORT updates the same node", async () => {
    const { platform, statement, reloads } = testPlatform(true);
    const seen: Seen = { clocks: [] };
    const container = mount();

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const callerBefore = yield* callerSees42;
      const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "browser-slice", runtime: Layer.empty }), { platform });
      const status = yield* Nexus.Application.status(running);
      const team = yield* Nexus.Application.createState(running, Team, initialTeam);
      const run = <A, F>(effect: Effect.Effect<A, F, Nexus.Event.EventBusShape | Nexus.Capability.EnvironmentShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));
      const published = Nexus.Runtime.runFork(running.runtime, Stream.runCollect(Stream.take(Nexus.Event.subscribe(UserSelected), 1)));
      yield* Effect.sleep("1 millis");

      const app = composer({ container, primitives }, run);
      yield* Effect.promise(() => app.show(application(team, seen)));
      const drawnHtml = container.innerHTML;
      const img = container.querySelector("img")!;
      const callerDuring = yield* callerSees42;

      // A real click on Ada's avatar: Chromium → PORT → (handler, payload) → composer → NEXUS → users.select.
      yield* Effect.promise(() => userEvent.click(img));
      yield* Effect.promise(app.settled);
      const selected = yield* team.get;

      // A real click on Refresh: users.refresh → UsersSource → state → a new render → PORT updates in place.
      yield* Effect.promise(() => userEvent.click(container.querySelector("button")!));
      yield* Effect.promise(app.settled);
      yield* Effect.promise(() => until(() => container.querySelector("img")?.getAttribute("src") === "ada-2.png"));
      const refreshed = yield* team.get;
      const updatedHtml = container.innerHTML;
      const sameImg = container.querySelector("img") === img;

      const events = Chunk.toReadonlyArray(yield* Fiber.join(published));
      yield* Effect.promise(app.stop);
      yield* Nexus.Application.shutdown(running);
      const callerAfter = yield* callerSees42;

      return { status, drawnHtml, dispatched: [...app.dispatched], selected, refreshed, updatedHtml, sameImg, events, callerBefore, callerDuring, callerAfter, after: container.innerHTML };
    })));

    // 1–3. MESH compiled (setup), initialized here, and rendered what the jsdom slice renders.
    expect(result.status).toEqual({ _tag: "Running" });
    expect(result.drawnHtml).toBe(slice.firstHtml);
    // 4. The real click gave MESH's reviewed intent.
    expect(result.dispatched).toHaveLength(2);
    expect(intentOf(result.dispatched[0])).toEqual(slice.intent);
    // 5. NEXUS ran users.select.
    expect(result.selected.selectedUserId).toEqual(Option.some("u1"));
    expect(result.events).toEqual([{ userId: "u1" }]);
    // 6–8. users.refresh resolved UsersSource, reloaded once, and changed the state.
    expect(intentOf(result.dispatched[1])?.command).toEqual({ component: "users", name: "refresh" });
    expect(reloads.count).toBe(1);
    expect(result.refreshed.first).toEqual(second.first);
    // 9. PORT updated the same DOM node in place.
    expect(result.sameImg).toBe(true);
    expect(result.updatedHtml).toBe(slice.updatedHtml);
    expect(result.after).toBe("");
    // 10. Application code observed the platform's Clock...
    expect(seen.clocks).toEqual([42, 42]);
    // 11. ...and the caller, which also runs the composer, never did.
    expect({ before: result.callerBefore, during: result.callerDuring, after: result.callerAfter }).toEqual({ before: false, during: false, after: false });

    // The static facts agree with what ran: every unit supported, and the platform's statement honest.
    const analysis = Nexus.Semantic.analyze({ declarations, profile: statement, require: ["target-compatibility"] });
    expect(analysis._tag === "Analyzed" && analysis.operations.map(({ id, classification }) => [id, classification])).toEqual([["start", "supported"], ["users.select", "supported"], ["users.refresh", "supported"]]);
    expect(await conformance(platform, statement)).toEqual([]);
  }, 30_000);

  it("negative: UsersSource absent: users.refresh incompatible, the application still starts, and Refresh fails alone", async () => {
    const { platform, statement, reloads } = testPlatform(false);
    const seen: Seen = { clocks: [] };
    const container = mount();

    // Static: only users.refresh is incompatible (v0.8: a unit's requirement isn't start necessity).
    const analysis = Nexus.Semantic.analyze({ declarations, profile: statement, require: ["target-compatibility"] });
    expect(analysis._tag).toBe("Analyzed");
    if (analysis._tag === "Analyzed") {
      expect(analysis.operations.map(({ id, classification }) => [id, classification])).toEqual([["start", "supported"], ["users.select", "supported"], ["users.refresh", "incompatible"]]);
      expect(analysis.operations[2]!.verdict).toEqual({ _tag: "Incompatible", notProvided: [UsersSource.id] });
      expect(analysis.diagnostics.map(({ code, subject }) => [code, subject])).toEqual([["nexus-incompatible-target-capability", "users.refresh"]]);
    }
    expect(await conformance(platform, statement)).toEqual([]);

    const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Nexus.Application.start(Nexus.Application.define({ name: "browser-slice", runtime: Layer.empty }), { platform });
      const statusAfterStart = yield* Nexus.Application.status(running);
      const team = yield* Nexus.Application.createState(running, Team, initialTeam);
      const run = <A, F>(effect: Effect.Effect<A, F, Nexus.Event.EventBusShape | Nexus.Capability.EnvironmentShape>) => Nexus.Runtime.run(running.runtime, Effect.exit(effect));

      const app = composer({ container, primitives }, run);
      yield* Effect.promise(() => app.show(application(team, seen)));
      const img = container.querySelector("img")!;

      yield* Effect.promise(() => userEvent.click(container.querySelector("button")!));
      yield* Effect.promise(app.settled);
      const stateAfterRefresh = yield* team.get;
      const htmlAfterRefresh = container.innerHTML;
      const statusAfterRefresh = yield* Nexus.Application.status(running);

      // An unrelated interaction still works.
      yield* Effect.promise(() => userEvent.click(img));
      yield* Effect.promise(app.settled);
      const stateAfterSelect = yield* team.get;
      const sameImg = container.querySelector("img") === img;

      yield* Effect.promise(app.stop);
      yield* Nexus.Application.shutdown(running);

      return { statusAfterStart, stateAfterRefresh, htmlAfterRefresh, statusAfterRefresh, stateAfterSelect, sameImg, dispatched: [...app.dispatched] };
    })));

    expect(result.statusAfterStart).toEqual({ _tag: "Running" });
    expect(result.dispatched).toHaveLength(2);
    // Refresh: MESH's intent was produced, and the command failed with the typed capability error.
    expect(JSON.stringify(failureOf(result.dispatched[0]))).toContain('"_tag":"CapabilityUnavailableError"');
    expect(JSON.stringify(failureOf(result.dispatched[0]))).toContain(`"id":"${UsersSource.id}"`);
    expect(reloads.count).toBe(0);
    // Nothing changed: state, DOM, lifecycle.
    expect(result.stateAfterRefresh).toEqual(initialTeam);
    expect(result.htmlAfterRefresh).toBe(slice.firstHtml);
    expect(result.statusAfterRefresh).toEqual({ _tag: "Running" });
    // The avatar still selects.
    expect(intentOf(result.dispatched[1])).toEqual(slice.intent);
    expect(result.stateAfterSelect.selectedUserId).toEqual(Option.some("u1"));
    expect(result.sameImg).toBe(true);
    expect(seen.clocks).toEqual([42]);
  }, 30_000);
});
