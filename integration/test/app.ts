// The slice's application: MESH's slice compiled with the real compiler,
// the NEXUS side (state, scope, commands and their bindings), and the
// Web realization of its primitives. Shared by the integration tests.
import type { WebPrimitives } from "@valancex/port-web";

import { compile } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import { attribute, booleanAttribute } from "@valancex/port-web";
import { Effect, Option, Schema } from "effect";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const fixture = new URL("../../fixtures/mesh-slice/", import.meta.url);
export const read = (path: string): string => readFileSync(new URL(path, fixture), "utf8");
export const readJson = (path: string): unknown => JSON.parse(read(path));
const model = read("components.json");

/** Build time: MPRX → template-v1 with the real compiler. Sources default to MESH's slice. */
export const compileProgram = async (sources: { readonly users?: string; readonly "user-card"?: string } = {}): Promise<Nexus.Mesh.Program> => {
  const templateOf = async (component: "users" | "user-card"): Promise<string> => {
    const result = await compile({ source: sources[component] ?? read(`${component}.mprx`), path: `${component}.mprx`, model: { manifest: model, path: "components.json", component } });

    if (result.template === undefined) {
      throw new Error(`${component} doesn't compile: ${JSON.stringify(result.diagnostics)}`);
    }

    return JSON.stringify(result.template);
  };

  return { root: "users", templates: [await templateOf("users"), await templateOf("user-card")], model };
};

const User = Schema.Struct({ id: Schema.String, name: Schema.String, avatar: Schema.optional(Schema.String), active: Schema.Boolean });
export const Team = Schema.Struct({ title: Schema.String, first: User, second: User, compact: Schema.Boolean, selectedUserId: Schema.OptionFromSelf(Schema.String) });
export type Team = Schema.Schema.Type<typeof Team>;

const Snapshot = Schema.Struct({ title: Schema.String, first: User, second: User, compact: Schema.Boolean });
export const first = Schema.decodeUnknownSync(Snapshot)(readJson("snapshots/first.json"));
export const second = Schema.decodeUnknownSync(Snapshot)(readJson("snapshots/second.json"));
export const initialTeam: Team = { ...first, selectedUserId: Option.none() };

export const UserSelected = Nexus.Event.define("UserSelected", Schema.Struct({ userId: Schema.String }));

/** The application's MESH host over `team`, for `program`. One host is one program. */
export const application = (team: Nexus.State.StateHandle<Team>, program: Nexus.Mesh.Program) => {
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

/** The Web realization of the slice's primitives: PORT Web configuration, chosen by this application. */
export const primitives: WebPrimitives = {
  page: { element: "section", props: { title: attribute("aria-label") } },
  text: { element: "span" },
  avatar: {
    element: "img",
    props: { src: attribute("src"), alt: attribute("alt"), size: attribute("data-size") },
    events: { click: { type: "click", payload: (event) => ({ x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY }) } },
  },
  button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
};

/** A document of the test's own, a container in it, and a way to click. */
export const dom = () => {
  const { window } = new JSDOM("<!doctype html><html><body><main></main></body></html>");
  const container = window.document.querySelector("main")!;
  const click = (target: Element, x = 0, y = 0) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));

  return { window, container, click };
};

/** Every DOM node under `root`, in document order, `root` included. */
export const domNodes = (root: Node): ReadonlyArray<Node> => [root, ...Array.from(root.childNodes).flatMap(domNodes)];

/** Waits, boundedly, for the DOM to reach a condition that a background render produces. */
export const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 200) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

export const expectedFirstHtml =
  '<section aria-label="Team">'
  + '<section aria-label="Ada Lovelace"><img alt="Ada Lovelace" data-size="sm" src="ada.png"><span>Ada Lovelace</span></section>'
  + '<section aria-label="Grace Hopper"><img alt="Grace Hopper" data-size="md"><span>Grace Hopper (inactive)</span></section>'
  + "<button>Refresh</button>"
  + "</section>";
