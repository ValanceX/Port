# API stability

What each public surface of PORT promises. The tiers have one meaning each, shared with MESH, NEXUS and VALANCE.

| Tier | Meaning |
|---|---|
| **Stable** | In a released version (0.9.0 or earlier for the npm packages, 0.3.0 or earlier for the crate). PORT is 0.x, so a minor version may change it, but only with the change named in that version's release notes, never silently. Error `code`s never change meaning and are never reused. |
| **Unreleased** | In the changelog's "Unreleased" section. Complete and tested, but not in any release: it may change before one. |
| **Not part of the contract** | Offered for tools, and said so in the documentation. May change or go in any release. |
| **Internal** | Not a contract. |

## By surface

| Surface | Tier |
|---|---|
| `createWebPort`, `WebPort.draw`, `update`, `hydrate`, `unmount`, `WebPortOptions`, `Report`, the primitives helpers (`attribute`, `booleanAttribute`, `controlled`, `controlledBoolean`, `property`, `textProperty`), a primitive's constant `attributes`, and an event's `key`, `WebRealizationError` and its `code`s, `UNKNOWN_COMPONENT_ELEMENT`, `realizeHtml` (the server entry), `HydrationResult`, `HydrationMismatch`, `WebPrimitive` / `WebPrimitives`, and contract version 1 (`docs/CONTRACT.md`) | Stable |
| `WebPort.patch` and `RenderPatch` / `RenderPatches` (an addition to contract version 1) | Stable |
| `WebPort[Symbol.dispose]` (where the platform has it) and the `unmount` guarantees: safe to call twice, usable again by `draw` | Stable |
| `WebPort.inspect`, and the touched keys `patch` returns | Not part of the contract (devtools hooks) |
| `@valancex/port-desktop-vocabulary` (`vocabulary.json`, `content.json`): the Desktop PORT's vocabulary, published as data | Stable. Its components, props and events are those of the released version; a minor adds and says so in its release notes (0.7 form primitives and the choice group, 0.8 `label`, 0.9 the table), and nothing has been removed or renamed since 0.6 |
| `valancex-port-desktop` (0.3.0 released, 0.3.1 prepared): `Port` (`draw`, `update`, `unmount`), `Report`, `PortError` codes, `vocabulary.json`, the content layer (`content.json`) and the host protocol (version 1; `resize` and the other messages) | Stable in a released version (the table, 0.3.0); 0.3.1 is a fix and adds nothing. The crate's tests run on Linux and Windows; macOS is not built or tested |
| Anything the package's `exports` doesn't list | Internal |
