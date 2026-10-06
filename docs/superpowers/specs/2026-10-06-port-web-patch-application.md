# PORT Web: applying render patches (design)

Status: **proposal for review** (2026-10-06). Nothing here is implemented. Companion: MESH's [fine-grained reactivity and composition design](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md), which defines `render-patch-v1` and the equivalence law.

## What changes for PORT

Today the composer gives PORT a whole tree on every state change and `update(tree)` reconciles it by key. MESH will additionally offer `update(render, snapshot)`, returning a **patch list** against the drawn tree. PORT gets one new verb:

| Operation | Meaning |
|---|---|
| **patch(patches)** | Apply `render-patch-v1` operations, in order, to the drawn tree's realization. The composer asserts the patches were produced from the render whose tree is drawn. |

`draw`, `update`, `unmount` and Web's `hydrate` keep their meanings. `update(tree)` remains valid and is the fallback: a composer that doesn't use patches loses nothing. This is an addition to contract version 1, not a break (the contract already allows a PORT to add operations that keep the others' meanings).

## Rules

1. **Same input, same result.** After `patch(p)` the realization is equivalent to `update(tree')` for the `tree'` that `p` yields from the drawn tree. This is MESH's equivalence law seen from PORT, and it is PORT's conformance test: apply the patches, and compare with a full `update`.
2. **Keys only.** Patches name nodes by key. PORT compares keys for equality and parses nothing (obligation 5). It still never infers program continuity; the composer asserts it.
3. **Identity is kept.** `setProp`, `removeProp`, `setText` and `move` never replace the target object. `remove` disposes it; a key that later returns is a new object (MESH §9.10).
4. **Values are realized as before.** A `setProp` value goes through the same value realization table (spec §9.8.7): natively, or as the `propText` the patch carries. PORT converts nothing. A value with no conforming slot is a realization error.
5. **Atomic validation.** The whole patch list is validated against the drawn tree and the primitives table (unknown key, unknown prop, unrealizable value) *before* any target mutation. A refused list changes nothing, matching the existing "an error refuses the tree before the target is touched" rule.
6. **`replace` is `draw`.** A `replace` op means the composer must treat the following tree as a draw: nothing is reused. (The composer asked for patches on the premise of program continuity, so a MESH that emits `replace` is signalling that it could not patch; PORT still never infers anything from it.)
7. **Events.** Handler identifiers stay stable across patches, so existing listeners remain correct. An `insert` installs listeners exactly as `draw` does for those nodes. Event resolution (§9.9) is unchanged.
8. **Hydration.** A hydrated tree is as after `draw`, so `patch` is valid after `hydrate` exactly as `update` is.

## Web specifics

- A `setProp` on a `controlled` slot follows the existing controlled-field rule: a declined edit with no commit is reasserted at the next presentation, now meaning the next `setProp` or `update` that touches that key.
- Batching: PORT applies one patch list synchronously. It neither defers to a frame nor coalesces across calls; scheduling is the composer's (Valance's Web host) decision.
- The server entry (`realizeHtml`) has no patch operation; patches are a client concept.

## Web Components as primitives

The Web PORT's `property` realization already writes a prop to a DOM property, and a custom element's public API is properties and events. So a custom element needs no new PORT mechanism: it is a primitives-table entry. This section fixes the rules so they hold under patching.

- **One table entry per custom tag**, like any element: `props` map to `attribute`, `booleanAttribute`, `property`, `textProperty` or `controlled`; `events` map to DOM events with an optional payload hook (`EventRealization.payload`). A prop or event with no entry is still an error (fail closed).
- **Rich values use `property`.** A list or record prop (`<my-chart points={...}>`) has no text form (§9.7.8), so it can only go natively: into a DOM property that holds the same structure. A custom element's property does, so it is the correct slot, and an attribute is not (it would need JSON, forbidden by §9.8.7).
- **Timing.** Properties are written after the element is created and before it is connected, so an element upgraded later still receives them. `setProp` after connection writes the property again, as the element expects. Patches never recreate the element, so its internal state and focus survive an update (keeps identity, rule 3).
- **Events.** A custom event is a primitive event with at most one applicable event per interaction, exactly as for a native one. Event names are the table's, never inferred from the tag. A payload hook builds plain boundary data from `event.detail`; target event objects never leave PORT. Composed or bubbling behavior does not change which binding receives an interaction (event resolution is MESH's walk).
- **Server rendering.** `realizeHtml` refuses a present value in a `property` slot (`unserializable-prop`), so a custom element with rich props is client-only unless the table maps an equivalent attribute. This is a limitation to document, not to work around: PORT never derives an attribute from a property.
- **Children and slots.** MESH's child content (M4) becomes light-DOM children of the element. Mapping a MESH slot to a custom element's `<slot name>` is a table choice, and not a contract change.
- **Not in scope:** registering or defining elements (`customElements.define`) is the application's job, not PORT's. A missing definition is not an error PORT can detect, so the tag realizes as an unknown element until defined.

Deliverables: a table-building helper example for a custom element, conformance tests in jsdom (property written, event payload reported, patch keeps the same element object) and one Chromium test with a real autonomous custom element.

## Error handling

- **Fail closed, before touching the target.** `patch` validates the whole list first (rule 5): unknown key, a prop or event with no table entry, an unrealizable value, an ordering that references a key not yet inserted. A refused list changes nothing and reports a `WebRealizationError` with a code, as for `draw` and `update`.
- **A target failure mid-apply is reported, not hidden.** A DOM setter or a custom element's property setter can throw after validation passed. As with hydration's `adoption-failed`, PORT does not promise rollback of external side effects: it stops, reports a distinct `patch-failed` error naming the op index, and leaves the composer to recover by `draw`ing a full tree from its held `Render`. PORT never retries or guesses.
- **Failures are state, upstream.** PORT shows whatever tree it is given; an error UI is the app's state rendered through MESH. PORT adds no error rendering of its own.

## Devtools

PORT keeps no history; it only realizes. It helps devtools in two ways: (1) it exposes a read-only `inspect(key)` that returns the realized target object for a key (so a devtools panel can highlight a MESH node), and (2) `patch` returns the list of keys it touched, so a panel can flash them. Both are Web additions outside the contract. Recording, replay and time travel use MESH's session log and `draw`: jumping to a past step is a `draw` of that step's tree.

## Milestones (PORT's side of MESH's M1 and M2)

1. **M1:** `patch` for `setProp`, `removeProp`, `setText`; validation-before-mutation; unit tests in jsdom; the equivalence test against `update`; a Chromium test that a one-field change mutates exactly one DOM node (observed with a `MutationObserver`).
2. **M2:** `insert`, `remove`, `move`; reuse of node objects across `move`; keyed-reorder test.
3. **Web Components (can ship with M1):** documented table recipe, jsdom and Chromium tests as above.
4. **Error handling (with M1):** `patch-failed` and validation-before-mutation tests, including a throwing property setter.
5. **Devtools hooks (with M2):** `inspect(key)` and touched-keys return value.
6. Bump `@valancex/mesh-runtime` peer range in lockstep with MESH's release, and cover the new schema in the integration slice.

## Documentation to change when this lands

`docs/CONTRACT.md` (new operation, and the "Not in version 1" list stays as is until M2 settles lists and conditionals), the Web value realization note, `docs/ROADMAP.md`, the README status and the changelog.
