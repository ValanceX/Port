# PORT Architecture

This document covers PORT's part of the Valance design: what it's responsible for, what it deliberately stays out of, and the rules that keep it that way. The sibling repos, [NEXUS](https://github.com/ValanceX/Nexus) and [MESH](https://github.com/ValanceX/Mesh), each have their own architecture doc. For the big picture, start at the [ValanceX organization page](https://github.com/ValanceX).

## The short version

PORT is where Valance meets a real screen. It takes compiled UI from MESH and turns it into whatever the target understands: DOM nodes, canvas draw calls, or commands for an embedded display.

A good way to picture PORT is as a printer driver. The document is already written and approved before the driver sees it. The driver's only job is to put it on this particular device, so swapping printers doesn't change the document.

## What PORT is responsible for

PORT translates MESH output into a representation specific to one target. Each target gets its own renderer:

```text
MESH
 ↓
PORT
 ├── Web
 ├── Canvas
 ├── Device Display
 └── Other Renderers
```

Targets we expect to support include the Web DOM, Canvas, embedded displays, custom device displays, and native UI toolkits.

A renderer:

- receives a **MESH tree**: compiled, validated, renderer-independent UI;
- maps each node onto the target's native API;
- handles the lifecycle of what it draws: mount, update, and unmount.

## What PORT stays out of

PORT is intentionally "dumb" about the application. That's the point: a renderer should be replaceable without changing a single line of application or business logic.

- **No business logic.** Rules like "can this cart check out?" live in NEXUS.
- **No language knowledge.** PORT never sees MPRX source. It only ever receives output that MESH has already validated.
- **No capability decisions.** See below.

## Hardware capabilities: who decides?

Devices differ: some have haptics or a camera, some have tiny screens, and some are offline. Valance resolves these differences in **NEXUS**, not in PORT:

```text
Application → NEXUS → detect environment → resolve capability → application receives the result
```

PORT still needs to know what its own target is able to *draw*, for example whether a display supports a given primitive. But decisions like "what do we do when this isn't supported?" (a fallback, a no-op, or a simpler representation) are made upstream, in one place. That keeps renderer code free of scattered device checks.

## Packages

| Package | Role |
|---|---|
| `@valence/port` | The core contract every renderer implements |
| `@valence/port-web` | Web DOM renderer |
| `@valence/port-canvas` | Canvas renderer |

Renderers depend on the core contract and never on each other, so adding a target never means touching an existing one.

## The rules

These invariants keep PORT honest. If a change would break one of them, it probably belongs in another repo.

1. **PORT never owns application or business logic.**
2. **Renderers are replaceable.** Swapping one must not require changes to application logic.
3. **The input is renderer-independent.** The MESH tree PORT consumes carries no target-specific assumptions.
4. **No leaks in either direction.** Renderer-specific conditions don't leak into domain code, and PORT doesn't reach up into domain code.
5. **Nothing is silently dropped.** Unsupported capabilities have an explicit strategy, decided in NEXUS. PORT does not quietly ignore what it can't render.
