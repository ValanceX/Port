# API stability

What each public surface of PORT promises. The tiers have one meaning each, shared with MESH, NEXUS and VALANCE.

| Tier | Meaning |
|---|---|
| **Stable** | In a released version (0.4.1 or earlier). PORT is 0.x, so a minor version may change it, but only with the change named in that version's release notes, never silently. Error `code`s never change meaning and are never reused. |
| **Unreleased** | In the changelog's "Unreleased" section. Complete and tested, but not in any release: it may change before one. |
| **Not part of the contract** | Offered for tools, and said so in the documentation. May change or go in any release. |
| **Internal** | Not a contract. |

## By surface

| Surface | Tier |
|---|---|
| `createWebPort`, `WebPort.draw`, `update`, `hydrate`, `unmount`, `WebPortOptions`, `Report`, the primitives helpers (`attribute`, `booleanAttribute`, `controlled`, `property`, `textProperty`), `WebRealizationError` and its `code`s, `UNKNOWN_COMPONENT_ELEMENT`, `realizeHtml` (the server entry), `HydrationResult`, `HydrationMismatch`, `WebPrimitive` / `WebPrimitives`, and contract version 1 (`docs/CONTRACT.md`) | Stable |
| `WebPort.patch` and `RenderPatch` / `RenderPatches` (an addition to contract version 1) | Stable |
| `WebPort[Symbol.dispose]` (where the platform has it) and the `unmount` guarantees: safe to call twice, usable again by `draw` | Stable |
| `WebPort.inspect`, and the touched keys `patch` returns | Not part of the contract (devtools hooks) |
| Anything the package's `exports` doesn't list | Internal |
