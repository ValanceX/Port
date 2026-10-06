# PORT

**Realize the same app on any target, without touching its meaning.**

PORT is the target realization layer of [Valance](https://github.com/ValanceX). It takes a UI that MESH has already described and evaluated, and realizes it on a real target: today a browser, later perhaps a native toolkit, a canvas or a device.

> Valance defines what an application means. PORT determines how that meaning is realized on a target. The target determines the implementation technology.

[MESH](https://github.com/ValanceX/Mesh) describes *what* the UI is. [NEXUS](https://github.com/ValanceX/Nexus) decides *what the app does*. PORT decides *how that meaning is realized on one particular target*. A PORT is a **target backend**, not a driver and not an adapter: it lowers renderer-independent output onto its target, and is free to specialize as far as the target rewards, as long as the meaning holds.

## What crosses the boundary

PORT depends on neither NEXUS nor the MESH runtime. Whoever composes the application connects them:

```text
MPRX ─▶ MESH compiler ─▶ template-v1 ─▶ MESH runtime ─▶ render-v1
                                          (inside NEXUS's Mesh.host)
                                                  │ Render
                                                  ▼
                                               composer ── keeps the drawn Render
                                                  │ draw(tree) / update(tree) / patch(patches) / unmount()
                                                  ▼
                                               PORT ─▶ target (DOM)
                                                  │ report(handler, payload?)
                                                  ▼
                              composer ─▶ host.dispatch(render, handler, payload) ─▶ NEXUS command
```

- **In:** a MESH render tree ([render-v1](https://github.com/ValanceX/Mesh/blob/main/schemas/render-v1.schema.json)), and whether it comes from the same program as the drawn one (*update*) or not (*draw* afresh). That fact, **program continuity**, is the composer's: PORT never infers it from the tree.
- **Out:** the drawn tree's handler identifier for an event, and its payload.

That's the whole [PORT contract](./docs/CONTRACT.md). It is language-neutral: render-v1 is a JSON Schema MESH implements in Rust and JavaScript, and the operations are three verbs (plus `patch`, below) and a report. Each PORT binds them in whatever language suits its target.

## Packages

| Package | What it is |
|---|---|
| [`@valancex/port-web`](./packages/port-web) | The Web PORT: render-v1 → DOM, in-place updates by key, events → reports, and hydration of server HTML. Its `@valancex/port-web/server` entry realizes render-v1 as HTML with no DOM. TypeScript, because the DOM is JavaScript-native. |

There is deliberately **no shared `@valancex/port` package** and no Canvas placeholder. The shared contract is data and prose, not code, and a TypeScript package every PORT depends on would force a TypeScript shape on a future Rust or native PORT. A shared package can come when a second PORT shows code worth sharing. The [integration audit](./docs/architecture/2026-09-27-port-integration-audit.md) records the evidence.

`integration/` (private) runs the whole slice, MPRX to DOM and back, against the published MESH and NEXUS packages.

## Where PORT fits

| PORT does | PORT does not |
|---|---|
| Realize render trees on its target, values exactly as given | Own business rules or application behavior (NEXUS) |
| Keep each node's target identity across updates from one program | Know MPRX, templates or what a component means (MESH) |
| Report interactions as handler identifiers and payloads | Decide what an interaction means, or see commands (NEXUS) |
| Decide what each of the application's primitives becomes on its target | Decide how to handle missing device capabilities (NEXUS) |

## Status

**v0.3.0 (released 2026-10-05): Web realization on MESH v0.6 to v0.9, with server rendering and controlled fields.** v0.3 adds `controlled(name)`, a text-slot realization for a field the user edits (see the [v0.3 release notes](./docs/releases/v0.3.md)); VALANCE's `Web.textField` is built on it. The sections below describe the v0.2 base it extends. See the [changelog](./CHANGELOG.md) for what v0.2 guarantees, what it doesn't support, and its known limitations. `@valancex/port-web` draws, updates in place, realizes each prop natively or as MESH's text (`propText`), and resolves each interaction to at most one binding, as MESH v0.6 specifies. The vertical slice runs end to end against `@valancex/mesh-compiler` 0.6, `@valancex/mesh-runtime` 0.6 and `@valancex/nexus` 0.9 (the declared peer range is MESH runtime 0.6 to 0.9; VALANCE 0.5 runs on PORT Web 0.3.0 with MESH 0.9 and NEXUS 0.10.3), in jsdom and, since v0.2.1, in real Chromium with a NEXUS platform and one capability. The Web PORT passes MESH's conformance vectors.

The two semantic questions PORT handed MESH ([handoff](./docs/architecture/2026-09-27-mesh-semantic-handoff.md)) are settled by MESH v0.6: prop text and realization (spec §9.7.7, §9.8.7; the Web PORT's [value realization](./docs/architecture/2026-09-28-web-value-realization.md)) and event resolution (spec §9.9). The Web PORT also renders on a server, for a first, deliberately narrow subset: `@valancex/port-web/server` realizes a tree as HTML with no DOM, and the Web PORT's own `hydrate` takes it over in the browser, verified in full before anything is adopted. Neither is a PORT contract operation ([design](./docs/superpowers/specs/2026-09-28-port-web-ssr.md)).

**Unreleased: `patch(patches)`.** When MESH's `update` is used instead of rendering again, the composer gives PORT the `render-patch-v1` list it returns, and the Web PORT applies it in place: `setProp`, `removeProp` and `setText` change a kept part; `insert`, `remove` and `move` add, take away and reorder parts by key (a moved part keeps its DOM node); `replace` is a draw. The whole list is checked before the DOM is touched, each operation against the effect of the ones before it; an operation it doesn't know is refused, never skipped; and the result is what `update` of the full new tree gives (tested against hand-written lists, and end to end against the real MESH runtime's patches over thousands of random updates). It needs a MESH that has `update`, which is not yet released, so it has no released MESH peer range yet. See the [CONTRACT](./docs/CONTRACT.md#patch) and the [patch design](./docs/superpowers/specs/2026-10-06-port-web-patch-application.md).

Not yet: accessibility and styling beyond a realization table's choices. See the [roadmap](./docs/ROADMAP.md).

```console
$ pnpm install
$ pnpm test
```

## Learn more

- [**The PORT contract**](./docs/CONTRACT.md): what every PORT promises
- [**Architecture**](./docs/ARCHITECTURE.md): PORT's responsibilities and rules
- [**Integration audit**](./docs/architecture/2026-09-27-port-integration-audit.md): the evidence behind the boundary, with open questions and contradictions
- [**Web value realization**](./docs/architecture/2026-09-28-web-value-realization.md): how the Web PORT realizes each value in each slot, and what SSR needs
- [**MESH semantic handoff**](./docs/architecture/2026-09-27-mesh-semantic-handoff.md), with the [event propagation audit](./docs/architecture/2026-09-27-event-propagation-audit.md) and [value realization audit](./docs/architecture/2026-09-27-value-realization-audit.md): the questions MESH v0.6 answered
- [**Changelog**](./CHANGELOG.md)
- [**Roadmap**](./docs/ROADMAP.md)

## Tech

The Web PORT is TypeScript with pnpm, Node 22+. The language of a PORT follows its target; it isn't a Valance-wide choice.

## License

MIT. See [`LICENSE`](./LICENSE).
