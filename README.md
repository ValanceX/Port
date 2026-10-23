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

That's the whole [PORT contract](./docs/CONTRACT.md). What each public surface promises (stable, unreleased, not part of the contract): [API stability](./docs/stability.md). It is language-neutral: render-v1 is a JSON Schema MESH implements in Rust and JavaScript, and the operations are three verbs (plus `patch`, below) and a report. Each PORT binds them in whatever language suits its target.

## Packages

| Package | What it is |
|---|---|
| [`valancex-port-desktop`](./packages/port-desktop) | The Desktop PORT (0.3.1 released, 0.4.0 prepared; its own tag): render-v1 → a native window, built and tested on Linux and Windows, with a vocabulary of its own (seventeen components: layout, text, a button, a checkbox, a text field, a choice group, a caption, a static table). Rust, because a native window is Rust's to draw. See the [architecture note](./docs/architecture/2026-10-14-port-desktop.md). |
| [`@valancex/port-desktop-vocabulary`](./packages/port-desktop-vocabulary) | The Desktop PORT's vocabulary as data (`vocabulary.json`, `content.json`), for the tools that check a template against it. Versioned with `@valancex/port-web`. |
| [`@valancex/port-web`](./packages/port-web) | The Web PORT: render-v1 → DOM, in-place updates by key, events → reports, and hydration of server HTML. Its `@valancex/port-web/server` entry realizes render-v1 as HTML with no DOM. TypeScript, because the DOM is JavaScript-native. |

There is deliberately **no shared `@valancex/port` package** (a second PORT now exists, and still shares nothing with the first but the contract) and no Canvas placeholder. The shared contract is data and prose, not code, and a TypeScript package every PORT depends on would force a TypeScript shape on a future Rust or native PORT. A shared package can come when a second PORT shows code worth sharing. The [integration audit](./docs/architecture/2026-09-27-port-integration-audit.md) records the evidence.

`integration/` (private) runs the whole slice, MPRX to DOM and back, against the published MESH and NEXUS packages.

## Where PORT fits

| PORT does | PORT does not |
|---|---|
| Realize render trees on its target, values exactly as given | Own business rules or application behavior (NEXUS) |
| Keep each node's target identity across updates from one program | Know MPRX, templates or what a component means (MESH) |
| Report interactions as handler identifiers and payloads | Decide what an interaction means, or see commands (NEXUS) |
| Decide what each of the application's primitives becomes on its target | Decide how to handle missing device capabilities (NEXUS) |

## MESH's conformance vectors

Both PORTs are checked against MESH's conformance vectors (values, events, node identity C1 to C22, and the program vectors with steps `snippets/`, `forwarder/` and `passing/`, and `enums/`), which come from the data-only package [`@valancex/mesh-conformance`](https://github.com/ValanceX/Mesh/tree/main/packages/mesh-conformance) and are **never copied** into this repository. The Web PORT runs all of them (`packages/port-web/test/conformance.test.ts`, `identity-conformance.test.ts`, `program-vectors.test.ts`: the committed trees of every step, drawn and updated, with keys kept, disposed and created as the cases say; the `enums/` cases `rejects` and `dispatches` are MESH's alone: no tree, no intent for a renderer); the Desktop PORT reads them where it can answer, and says in `packages/port-desktop/tests/conformance.rs` where it cannot (the program vectors' reorders and removals move a widget's accessibility node, four transitions listed exactly).

- `scripts/check-conformance.mjs` fails if a copy of the vectors exists anywhere in the tree, or if the installed package is older than the version in `conformance.json`. `pnpm test` runs it (`packages/port-web/test/vectors.test.ts`, which also shows it failing on a planted copy), and the Desktop CI job runs it.
- **The package is a development dependency of the workspace** (`"@valancex/mesh-conformance": "^0.14.0"`), from the registry. Moving to a newer MESH is a new range in the root `package.json` and a new `supports` in `conformance.json`. (Before MESH 0.14.0 was published it was a git dependency pinned to a MESH commit.)

## Status

The two npm packages share one version and are released together (one `v*` tag); the Desktop PORT crate has its own tag (`desktop-v*`). Newest first; the [changelog](./CHANGELOG.md) and the [release notes](./docs/releases) have the detail.

**v0.11.0 (prepared 2026-10-23; crate 0.5.0 prepared):** PORT behavior: focus follows identity and `focus(key)` on the Web; `group` (radios are one group) and `elementWhen` (a list's element chosen by `ordered`); on the Desktop, widget ids from node keys (all identity vectors pass), focus follows identity, the host's `focus` message and roving focus in a radio group. See the [release notes](./docs/releases/v0.11.md).

**v0.10.0 (prepared 2026-10-18; crate 0.4.0 prepared):** the Desktop PORT's vocabulary grows by `status` and `alert` (the live regions) and `toggle` (a button that stays pressed); `@valancex/port-web`'s peer range admits MESH 0.13 and 0.14, each line run (`scripts/check-mesh-range.mjs`). See the [release notes](./docs/releases/v0.10.md).

**v0.9.0 (released 2026-10-17; crate 0.3.0 released the same day, 0.3.1 prepared: a table's cells no longer wrap their text):** a static table in the Desktop PORT's vocabulary (`table`, `tablehead`, `tablebody`, `tablerow`, `columnheader`, `rowheader`, `cell`), drawn as one grid with the table, rows and cells in the accessibility tree. `@valancex/port-web` is unchanged. See the [release notes](./docs/releases/v0.9.md).

**v0.8 (released 2026-10-16; crate 0.2.0 released 2026-10-17):** `label` in the Desktop PORT's vocabulary, a caption that names the control inside it and activates it. `@valancex/port-web` is unchanged. See the [release notes](./docs/releases/v0.8.md).

**v0.7 (released 2026-10-16; v0.7.1 completes a publish that stopped halfway):** the Desktop PORT's vocabulary grows: form primitives (`kind`, `invalid`, `describedby`, `focus` and `blur`) and a choice group (`radiogroup`, `radio`, the event `select`). The crate's first release, 0.1.0 (`desktop-v0.1.0`), carries them and the host message `resize`. See the [release notes](./docs/releases/v0.7.md).

**v0.6 (released 2026-10-15):** `@valancex/port-desktop-vocabulary`, the Desktop PORT's vocabulary published as data, so `vlx check` and the editors do not carry a copy; the event `cancel` (Escape) and the host message `navigate`; and 0.6.1 lets two events of one primitive share a DOM event type when they are different keys. See the [release notes](./docs/releases/v0.6.md).

**v0.5 (released 2026-10-14):** the Web realization table can state constant attributes, a boolean control (`controlledBoolean`) and events made by one key (`submit` on Enter, `cancel` on Escape). See the [release notes](./docs/releases/v0.5.md).

**v0.4 (released 2026-10-10 to 2026-10-14):** `patch(patches)`, which applies the `render-patch-v1` list MESH 0.10's `update` returns, in place (0.4.0); a URL attribute never holds code (0.4.1); the MESH runtime peer range accepts 0.11 and 0.12 (0.4.2). See the [release notes](./docs/releases/v0.4.md).

**v0.3 (released 2026-10-05):** `controlled(name)`, a text-slot realization for a field the user edits; VALANCE's `Web.textField` is built on it. **v0.2 (released 2026-09-28 to 2026-10-05):** the Web PORT: elements, identity, text, attributes, events, `draw`, `update` (by key) and `unmount`, server rendering and hydration, and the peer range following MESH. See the [v0.3](./docs/releases/v0.3.md) and [v0.2](./docs/releases/v0.2.md) release notes.

The two semantic questions PORT handed MESH ([handoff](./docs/architecture/2026-09-27-mesh-semantic-handoff.md)) are settled by MESH v0.6: prop text and realization (spec §9.7.7, §9.8.7; the Web PORT's [value realization](./docs/architecture/2026-09-28-web-value-realization.md)) and event resolution (spec §9.9). The Web PORT also renders on a server, for a first, deliberately narrow subset: `@valancex/port-web/server` realizes a tree as HTML with no DOM, and the Web PORT's own `hydrate` takes it over in the browser, verified in full before anything is adopted. Neither is a PORT contract operation ([design](./docs/superpowers/specs/2026-09-28-port-web-ssr.md)).

Not yet: styling (PORT adds no style mechanism: an application's styles are its own, loaded per target by VALANCE as plain stylesheets; see Valance's [style contract](https://github.com/ValanceX/Valance/blob/main/docs/direction/bets/style-contract.md)), a grid (a table of controls), macOS in the Desktop PORT's CI, and any mobile or canvas PORT. See the [roadmap](./docs/ROADMAP.md).

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
- [**The Desktop PORT**](./docs/architecture/2026-10-14-port-desktop.md): the second target, its vocabulary and the host protocol
- [**API stability**](./docs/stability.md): what each public surface promises
- [**Documentation index**](./docs/README.md), [**Release notes**](./docs/releases), [**Changelog**](./CHANGELOG.md)
- [**Roadmap**](./docs/ROADMAP.md)

## Tech

The Web PORT is TypeScript with pnpm, Node 22+; the Desktop PORT is Rust (`cargo test`, `cargo clippy`). The language of a PORT follows its target; it isn't a Valance-wide choice.

## License

MIT. See [`LICENSE`](./LICENSE).
