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
                                                  │ draw(tree) / update(tree) / unmount()
                                                  ▼
                                               PORT ─▶ target (DOM)
                                                  │ report(handler, payload?)
                                                  ▼
                              composer ─▶ host.dispatch(render, handler, payload) ─▶ NEXUS command
```

- **In:** a MESH render tree ([render-v1](https://github.com/ValanceX/Mesh/blob/main/schemas/render-v1.schema.json)), and whether it comes from the same program as the drawn one (*update*) or not (*draw* afresh). That fact, **program continuity**, is the composer's: PORT never infers it from the tree.
- **Out:** the drawn tree's handler identifier for an event, and its payload.

That's the whole [PORT contract](./docs/CONTRACT.md). It is language-neutral: render-v1 is a JSON Schema MESH implements in Rust and JavaScript, and the operations are three verbs and a report. Each PORT binds them in whatever language suits its target.

## Packages

| Package | What it is |
|---|---|
| [`@valancex/port-web`](./packages/port-web) | The Web PORT: render-v1 → DOM, in-place updates by key, events → reports. TypeScript, because the DOM is JavaScript-native. |

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

**First Web realization.** `@valancex/port-web` draws, updates in place and reports events, and the vertical slice runs end to end against `@valancex/mesh-compiler` 0.5, `@valancex/mesh-runtime` 0.5 and `@valancex/nexus` 0.8.

**Waiting on MESH:** two semantic questions are open upstream, and PORT doesn't settle them itself:
- **event propagation**, which bindings one interaction triggers ([audit](./docs/architecture/2026-09-27-event-propagation-audit.md)). The Web PORT's current bubbling isn't contractual;
- **non-text prop values in text slots**: numbers, `null`, lists and records in attributes and server HTML ([audit](./docs/architecture/2026-09-27-value-realization-audit.md)). This blocks SSR, so server rendering and hydration are paused.

Not yet: accessibility and styling beyond a realization table's choices. See the [roadmap](./docs/ROADMAP.md).

```console
$ pnpm install
$ pnpm test
```

## Learn more

- [**The PORT contract**](./docs/CONTRACT.md): what every PORT promises
- [**Architecture**](./docs/ARCHITECTURE.md): PORT's responsibilities and rules
- [**Integration audit**](./docs/architecture/2026-09-27-port-integration-audit.md): the evidence behind the boundary, with open questions and contradictions
- [**MESH semantic handoff**](./docs/architecture/2026-09-27-mesh-semantic-handoff.md): the questions MESH must answer before SSR
- [**Event propagation audit**](./docs/architecture/2026-09-27-event-propagation-audit.md) and [**value realization audit**](./docs/architecture/2026-09-27-value-realization-audit.md): the open MESH questions
- [**Roadmap**](./docs/ROADMAP.md)

## Tech

The Web PORT is TypeScript with pnpm, Node 22+. The language of a PORT follows its target; it isn't a Valance-wide choice.

## License

MIT. See [`LICENSE`](./LICENSE).
