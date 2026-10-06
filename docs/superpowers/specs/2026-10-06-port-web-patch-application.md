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

## Milestones (PORT's side of MESH's M1 and M2)

1. **M1:** `patch` for `setProp`, `removeProp`, `setText`; validation-before-mutation; unit tests in jsdom; the equivalence test against `update`; a Chromium test that a one-field change mutates exactly one DOM node (observed with a `MutationObserver`).
2. **M2:** `insert`, `remove`, `move`; reuse of node objects across `move`; keyed-reorder test.
3. Bump `@valancex/mesh-runtime` peer range in lockstep with MESH's release, and cover the new schema in the integration slice.

## Documentation to change when this lands

`docs/CONTRACT.md` (new operation, and the "Not in version 1" list stays as is until M2 settles lists and conditionals), the Web value realization note, `docs/ROADMAP.md`, the README status and the changelog.
