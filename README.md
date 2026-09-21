# PORT

PORT is the rendering boundary of [VALENCE](https://github.com/valence-ui). It translates
[`mesh`](https://github.com/valence-ui/mesh) output (the MESH Semantic IR)
into a target-specific representation — Web DOM, Canvas, an embedded
display, a native UI toolkit, or a custom device display.

PORT is intentionally "dumb" relative to application logic: it never owns
business rules, and a renderer can be swapped without touching
[`nexus`](https://github.com/valence-ui/nexus) or `mesh`.

```text
MESH
 ↓
PORT
 ├── Web
 ├── Canvas
 ├── Device Display
 └── Other Renderers
```

## Layout

This repo is a pnpm workspace containing the core PORT abstraction plus one
package per renderer target:

```text
port/
└── packages/
    ├── port/         @valence/port        — core PORT contract, target-agnostic
    ├── port-web/      @valence/port-web    — Web DOM renderer
    └── port-canvas/   @valence/port-canvas — Canvas renderer
```

Renderer packages depend on `@valence/port`, never on each other.

## What lives here

- Translation of MESH IR nodes into calls against a specific rendering
  target's native APIs.
- Renderer-specific lifecycle/mount/update/unmount mechanics.

## What does not live here

- Business rules or domain logic (that's `nexus`).
- Any notion of MPRX syntax or MESH compilation (that's `mesh` — PORT only
  ever sees compiled/validated IR, never source).
- Hardware capability *resolution* (that's `nexus`); PORT may need to know
  what a target *can render*, but capability handshake logic lives upstream.

## Tech

TypeScript. Package manager: pnpm (this repo is a pnpm workspace, not part
of a VALENCE-wide monorepo).

## Status

Early scaffolding. No renderer implementation yet — see
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## License

MIT — see [LICENSE](./LICENSE).
