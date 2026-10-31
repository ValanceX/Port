# API stability

> **TL;DR:** What each public surface of PORT promises: stable, unreleased, not part of the contract, or internal.

---

What each public surface of PORT promises. The levels have one meaning each, shared with MESH, NEXUS and VALANCE.

| Level | Meaning |
|---|---|
| **Stable** | In a released version (0.9.0 or earlier for the npm packages, 0.3.1 or earlier for the crate; 0.10.0 and 0.4.0 are prepared). PORT is 0.x, so a minor version may change it, but only with the change named in that version's release notes, never silently. Error `code`s never change meaning and are never reused. |
| **Provisional** | Named so in the documentation. Its shape is not final, even after a release. |
| **Unreleased** | In the changelog's "Unreleased" section. Complete and tested, but not in any release: it may change before one. |
| **Not part of the contract** | Offered for tools, and said so in the documentation. May change or go in any release. |
| **Internal** | Not a contract. |

## By surface

| Surface | Level |
|---|---|
| `createWebPort`, `WebPort.draw`, `update`, `hydrate`, `unmount`, `WebPortOptions`, `Report`, the primitives helpers (`attribute`, `booleanAttribute`, `controlled`, `controlledBoolean`, `elementWhen`, `property`, `textProperty`), a primitive's `group`, `WebPort.focus` (0.11), a primitive's `layer` with `layerProp` and `layerDismiss` (0.12, prepared), a primitive's constant `attributes`, and an event's `key`, `WebRealizationError` and its `code`s, `UNKNOWN_COMPONENT_ELEMENT`, `realizeHtml` (the server entry), `HydrationResult`, `HydrationMismatch`, `WebPrimitive` / `WebPrimitives`, and contract version 1 (`docs/reference/contract.md`) | Stable |
| `WebPort.patch` and `RenderPatch` / `RenderPatches` (an addition to contract version 1) | Stable |
| `WebPort[Symbol.dispose]` (where the platform has it) and the `unmount` guarantees: safe to call twice, usable again by `draw` | Stable |
| The native hatch: `WebPortOptions.native`, the `@valancex/port-web/native` entry (`Native`, `NativeSetup`; types only), a primitive's `opaque`, and the code `opaque-children` (0.15.0, prepared). Web only, not part of contract version 1; a Desktop parallel waits for evidence (ROADMAP §2.8) | Provisional |
| The opt-in Web vocabulary: the `@valancex/port-web/vocabulary` entry (`vocabulary`, the portable core realized for the Web, and `vocabularyManifest`, its MESH manifest; 0.15.0, prepared). Not a default: `primitives` stays required | Provisional |
| `composeWebPort` and its types `ComposeOptions`, `ComposedScreen`, `WebComposer` (0.15.0, prepared; needs MESH 0.18.0 for context): the helper that drives a Web PORT from a Mesh screen (`openScreen`), so a caller shows snapshots and receives intents | Provisional |
| `WebPort.inspect`, and the touched keys `patch` returns | Not part of the contract (devtools hooks) |
| `@valancex/port-desktop-vocabulary` (`vocabulary.json`, `content.json`): the Desktop PORT's vocabulary, published as data | Stable. Its components, props and events are those of the released version; a minor adds and says so in its release notes (0.7 form primitives and the choice group, 0.8 `label`, 0.9 the table, 0.10 `status`, `alert` and `toggle`), and nothing has been removed or renamed since 0.6 |
| `valancex-port-desktop` (0.5.0 released: keyed widget ids, focus, the `focus` message, `Port::focus`; 0.6.0 prepared: dialog and popover, `dismiss`): `Port` (`draw`, `update`, `unmount`), `Report`, `PortError` codes, `vocabulary.json`, the content layer (`content.json`) and the host protocol (version 1; `resize` and the other messages) | Stable in a released version (the table, 0.3.0); 0.3.1 is a fix and adds nothing. The crate's tests run on Linux and Windows; macOS is not built or tested |
| Anything the package's `exports` doesn't list | Internal |

## Next steps

* [Changelog](../../CHANGELOG.md).
