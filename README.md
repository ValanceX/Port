# PORT

**Render the same UI anywhere, without touching your app.**

PORT is the rendering layer of [Valance](https://github.com/ValanceX). It takes a UI that has already been described and validated, and draws it on a real screen: a browser, a canvas, an embedded display, a native toolkit, or custom hardware.

Most UI frameworks tie your application to one rendering target. Valance keeps them apart. [MESH](https://github.com/ValanceX/Mesh) describes *what* the UI is. [NEXUS](https://github.com/ValanceX/Nexus) decides *what the app does*. PORT only decides *how it looks on this particular device*. Because of that split, you can swap the renderer without rewriting any business logic.

```text
               ┌──────────── PORT ────────────┐
MESH IR  ───▶  │  Web  ·  Canvas  ·  Device   │  ───▶  pixels
               └──────────────────────────────┘
```

## Why PORT

- **One app, many screens.** Ship the same application to the web, a canvas surface, or a small device display by choosing a different renderer.
- **Renderers stay simple.** A renderer only receives compiled, validated UI. It never parses source and never runs business rules, so it's small and easy to reason about.
- **No hidden device checks.** Questions like "does this device have a camera?" are answered upstream in NEXUS. Renderer code isn't full of `if (device.hasX)` branches.
- **Add a new target in one place.** To support a new display, you write one new renderer package against the shared contract.

## Packages

PORT is a pnpm workspace. It contains one core contract and one package per rendering target:

| Package | What it is |
|---|---|
| `@valence/port` | The target-agnostic contract that every renderer implements |
| `@valence/port-web` | Web DOM renderer |
| `@valence/port-canvas` | Canvas renderer |

Renderer packages depend on `@valence/port` and never on each other.

## Where PORT fits

| PORT does | PORT does not |
|---|---|
| Turn MESH IR nodes into native calls for its target | Own business rules or domain logic (that's NEXUS) |
| Handle mount, update, and unmount for its target | Know MPRX syntax or compile anything (that's MESH) |
| Know what its own target is able to draw | Decide how to handle missing hardware capabilities (that's NEXUS) |

## Status

**Early scaffolding.** The package layout and the boundaries are in place. No renderer is implemented yet. The first target is the Web DOM renderer, the last step of Valance's first end-to-end slice:

```text
user-card.mprx → MESH compiler → MESH IR → NEXUS runtime → PORT (Web) → browser
```

To see how PORT fits into the rest of the system, read [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Tech

TypeScript with pnpm. This repo has its own workspace and is not part of a Valance-wide monorepo.

## License

MIT. See [`LICENSE`](./LICENSE).
