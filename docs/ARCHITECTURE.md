# PORT — Architecture

This is the PORT-relevant excerpt of the VALENCE architecture. PORT is one of
three independent repos (`nexus`, `mesh`, `port`) that make up VALENCE; see
each repo's own docs for its slice, or the full design doc kept in the
[VALENCE namespace folder](https://github.com/valence-ui) for the complete
picture.

## Role

PORT is the rendering boundary. It translates MESH output into a
target-specific representation. It should be "dumb" relative to application
logic.

Potential targets: Web DOM, Canvas, embedded display, custom device display,
native UI.

```text
MESH
 ↓
PORT
 ├── Web
 ├── Canvas
 ├── Device Display
 └── Other Renderers
```

A renderer should be replaceable without changing application/business
logic. PORT must not own business logic.

## Hardware Capabilities (relevant boundary)

Hardware capabilities are resolved by NEXUS, not PORT:

```text
Application → NEXUS → Environment/Capability Detection → Capability Resolution → Application receives resolved capability
```

PORT may need to know what a given target *can render* (e.g. whether a
display supports a given primitive), but the capability handshake and its
fallback/no-op/degraded-representation strategy is decided upstream in
NEXUS, not scattered through renderer code.

## Repository Direction

```text
github.com/valence-ui/
├── nexus
├── mesh
└── port
```

Potential published packages: `@valence/port`, `@valence/port-web`,
`@valence/port-canvas`.

## Invariants relevant to PORT

1. PORT never owns application/business logic.
2. A renderer can be replaced without modifying application logic.
3. A MESH tree (what PORT consumes) is renderer-independent.
4. Renderer-specific conditions must not leak into domain/application code
   (the inverse also holds: PORT must not reach upward into domain code).
5. Unsupported capabilities have an explicit resolution strategy, decided in
   NEXUS — PORT does not silently ignore what it cannot render.
