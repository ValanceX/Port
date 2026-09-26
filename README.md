# PORT

**Realize the same app on any target, without touching its meaning.**

PORT is the target realization layer of [Valance](https://github.com/ValanceX). It takes a UI that has already been described and validated, and progressively lowers it onto a real target: a browser, a native toolkit, a GPU, an embedded display, or custom hardware.

> Valance defines what an application means. PORT determines how that meaning is realized on a target.

Most UI frameworks tie your application to one rendering target. Valance keeps them apart. [MESH](https://github.com/ValanceX/Mesh) describes *what* the UI is. [NEXUS](https://github.com/ValanceX/Nexus) decides *what the app does*. PORT decides *how that meaning is realized on this particular target*. Because of that split, you can swap the renderer without rewriting any business logic.

```text
                 ┌───────────────── PORT ──────────────────┐
MESH semantics ─▶│ lowering → PORT IR(s) → target lowering │─▶ target runtime ─▶ hardware
                 └─────────────────────────────────────────┘
```

## Why PORT

- **One app, many screens.** Ship the same application to the web, a canvas surface, or a small device display by choosing a different renderer.
- **A compiler backend, not an adapter.** A PORT preserves the *meaning* of the UI, not a common API. Each PORT picks its own intermediate representations and can specialize all the way down: native widgets, compositing, caching, SIMD, hardware paths, as long as the semantics hold.
- **Semantics survive lowering.** Identity, interaction intent and accessibility role stay available until the PORT no longer needs them, so abstraction never becomes the optimization ceiling.
- **Inspectable.** You should be able to see what a PORT did with each element, not guess.
- **No hidden device checks.** Questions like "does this device have a camera?" are answered upstream in NEXUS. Renderer code isn't full of `if (device.hasX)` branches.
- **Add a new target in one place.** A new target is one new PORT package consuming the shared semantic input. There is no universal renderer interface to extend.

## Packages

PORT is a pnpm workspace. It contains one core contract and one package per rendering target:

| Package | What it is |
|---|---|
| `@valence/port` | Shared boundary vocabulary: the semantic input a PORT consumes and its capability description. Not a renderer interface. |
| `@valence/port-web` | Web PORT (DOM + CSS), the first target |
| `@valence/port-canvas` | Placeholder, deferred until the Web PORT raises a question a second target would answer |

PORT packages depend on `@valence/port` and never on each other.

## Where PORT fits

| PORT does | PORT does not |
|---|---|
| Lower MESH semantics into target-native implementation | Own business rules or domain logic (that's NEXUS) |
| Optimize realization, as long as semantics are preserved | Know MPRX syntax or change what the UI means (that's MESH) |
| Handle mount, update, and unmount for its target | Decide how to handle missing device capabilities (that's NEXUS) |
| Describe what its target can guarantee (its capabilities) | Force every target to behave identically |

## Status

**Early scaffolding.** The package layout and the boundaries are in place. No PORT is implemented yet. The first target is the Web PORT, the last step of Valance's first end-to-end slice. It's deliberately treated as an architectural experiment: it shows which parts of Valance are genuinely portable before any second target is designed.

```text
user-card.mprx → MESH compiler → MESH IR → NEXUS runtime → PORT (Web) → browser
```

To see how PORT fits into the rest of the system, read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Tech

TypeScript with pnpm. This repo has its own workspace and is not part of a Valance-wide monorepo.

## License

MIT. See [`LICENSE`](./LICENSE).
