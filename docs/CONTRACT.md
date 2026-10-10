# The PORT contract, version 1

This is what every PORT promises, in any language, on any target. It is deliberately small. It is derived from MESH v0.6's render-tree format, its realization rule (spec §9.8.7) and event resolution (spec §9.9), and from NEXUS v0.8's boundary rules. The evidence is in the [integration audit](./architecture/2026-09-27-port-integration-audit.md); MESH v0.6 settled the two questions PORT handed it (the [MESH semantic handoff](./architecture/2026-09-27-mesh-semantic-handoff.md)).

It is **not** an API. Each PORT binds these operations to its own language and target however suits them. The Web PORT's binding is [`@valancex/port-web`](../packages/port-web/README.md).

## Who is involved

```text
            NEXUS  (Nexus.Mesh.host: render, renders, dispatch)
              ▲ │
   dispatch   │ │ Render
 (render, h, p)│ ▼
            composer  ── keeps the Render whose tree is drawn
              ▲ │
report (h, p) │ │ draw(tree) / update(tree) / patch(patches) / unmount()
              │ ▼
             PORT  ── realizes on ──▶ target
```

- **PORT** realizes render trees on one target and reports what the user does.
- **The composer** is whoever assembles the application: app code, a test, or later, tooling. It holds a NEXUS MESH host and a PORT, and connects them. NEXUS and PORT never depend on each other (NEXUS `docs/ARCHITECTURE.md` §16).

## Input: a render-v1 tree

PORT's only data input is a MESH render tree, as defined by MESH's [`render-v1.schema.json`](https://github.com/ValanceX/Mesh/blob/main/schemas/render-v1.schema.json) and [runtime manual](https://github.com/ValanceX/Mesh/blob/main/docs/manual/runtime.md). PORT does not redefine it, wrap it or extend it.

A PORT:
- accepts `format: "mesh-render"`, `version: 1`, and **refuses** any other format or version;
- **ignores** properties it doesn't know (the schema is additive within a version);
- never receives a MESH `Render`, a template, a manifest, a command intent, or anything from NEXUS.

## Operations

| Operation | Meaning | When the composer uses it |
|---|---|---|
| **draw(tree)** | Realize `tree` afresh, discarding whatever was realized before. No target object is reused. | The first tree, and any tree the composer knows comes from a **different program** than the drawn one. |
| **update(tree)** | The composer asserts that `tree` comes from the **same program** as the drawn tree. Realize its changes in place: the target object for each key present in both trees is kept. | Every later tree the composer knows comes from the same program. |
| **unmount()** | Remove the realization. Nothing is reported after it. Safe to call twice and before anything was drawn; the PORT stays usable (`draw` draws again; `update` and `patch` refuse until then). | When the UI goes away. |
| **patch(patches)** | *An addition to version 1 that keeps the others' meanings.* The composer asserts the MESH `render-patch-v1` list was made from the render whose tree is drawn. Realize its operations in place; the result is exactly what *update* of the full new tree gives. See [patch](#patch). | Instead of *update*, when the composer's MESH has `update` and the program is the same. |

The first three are every PORT's. `patch` is optional: a PORT without it loses nothing, since *update* of the full tree is always valid, and it needs a MESH that has `update` (MESH 0.10). A PORT may add operations for its own target that keep their meanings. The Web PORT adds one, **hydrate**, which isn't part of this contract (see [Web: server HTML and hydrate](#web-server-html-and-hydrate)).

### Program continuity

*draw* and *update* are not two ways of rendering. They carry one fact, **program continuity**: whether the incoming tree comes from the same MESH program as the drawn tree. That fact decides whether keys may be compared at all. MESH makes keys comparable only within one program, and may give two programs overlapping keys: a key says nothing about which program produced it.

> **PORT never determines whether two render trees belong to the same MESH program.** The composer does.

- **Only the composer knows.** It chose which host (and so which program) produced each `Render`, so it knows when the program changed: a template recompiled, added or removed, or a different root. MESH requires the host to say so (runtime manual: the host "tells its renderer when a new tree comes from a different program"). A `Render` doesn't expose its program identity, render-v1 carries none, and none is to be added.
- **PORT infers nothing** from keys, handler identifiers, tree shape, component names, payloads or any other property of render-v1. A *draw* reuses nothing, even when every key matches the drawn tree. An *update* reconciles by key, even when the tree looks nothing like the drawn one.
- **An update whose structure differs** doesn't make PORT decide that the program changed. PORT stays at the key level: a key only in the new tree is new, a key only in the old one is gone, as MESH's guide says. Matching is by key and nothing else, never by child index: reordering, inserting before and removing others keep each remaining key's target object, and a key that leaves and later returns is a new object (MESH §9.10). **Realization compatibility:** a target realization is retained only when the opaque key *and* the component are compatible; a key whose component changes is replaced (the old object disposed, a new one created). This is PORT's own safety rule for a target object that can't be a different component's, not a statement about MESH identity: MESH's identity already includes the component, so a valid MESH render doesn't give one identity two components, and PORT neither knows nor checks that.
- **Consequence of a wrong signal:** an *update* given a different program's tree is reconciled by key, which is meaningless across programs. That is the composer's error, and PORT can't detect it.

## patch

MESH's `update` returns a **patch list** (`render-patch-v1`, [`render-patch-v1.schema.json`](https://github.com/ValanceX/Mesh/blob/main/schemas/render-patch-v1.schema.json)): the operations that turn the previous tree into the next, which a PORT that has *patch* applies in place instead of reconciling a whole tree. Like render-v1 it is MESH's, and PORT neither redefines nor extends it.

| Operation | Meaning |
|---|---|
| `setProp(key, prop, value, propText?)` | The prop now has this value (and this MESH text). Realized exactly as a prop of a tree is (obligation 1). |
| `removeProp(key, prop)` | The prop is now absent. |
| `setText(key, text)` | A text run's new text. |
| `insert(parent, before?, node)` | A node (with its whole subtree) or text run is new under `parent`, before its child `before`, or last. |
| `remove(key)` | The part and everything under it is gone. |
| `move(key, before?)` | The same part, kept, now stands before its sibling `before`, or last. |
| `replace(tree)` | A *draw* of `tree`. It is the only operation of its list. |

- **The law.** After *patch(p)* the realization is equivalent to *update(tree′)*, where `tree′` is what `p` makes of the drawn tree. This is the PORT's conformance test: apply the list, and compare with a full *update*.
- **Keys only, and by key.** Operations name parts by key, compared for equality and never parsed (obligation 5), and parts are matched by key, never by position. The composer asserts program continuity, as for *update*; PORT infers nothing from a list, a `replace` included.
- **Identity is kept.** `setProp`, `removeProp`, `setText` and `move` never replace the target object, so a moved part keeps its realization and its state. `remove` disposes the part, and a key that returns is a new part (MESH §9.10). A part `insert`ed is realized exactly as a part of a drawn tree, listeners and all.
- **The list is read in order, and checked in full first.** Each operation is checked against the tree as the operations before it leave it (a later one may name a part an earlier one inserted, or no longer find one it removed), and every operation is checked before the target is touched. A list that can't be realized changes nothing, for the same reasons a tree is refused: a key not in the tree at that point (`unknown-key`), a key inserted twice (`duplicate-key`), an operation on a part of the wrong kind or on the root, which has no siblings (`unsupported-patch`), a prop with no realization or whose value its slot can't hold.
- **An operation it doesn't know is refused,** never skipped (`unsupported-patch`): skipping one would break the law. A later MESH may add operations without changing the version, and a PORT that doesn't know them must say so.
- **A target failure while applying is reported, not hidden.** A DOM setter or insertion can still throw after the check. The Web PORT stops, throws `patch-failed` with the step and the cause, doesn't undo the steps before it, and leaves the composer to recover with *draw* of the full tree it holds. It never retries.

## Output: interaction reports

When the user interacts with a realized node, PORT resolves the interaction to at most one binding, and reports it:

```text
report(handler, payload?)
```

- `handler` is the handler identifier the **drawn** tree gives for the binding the interaction resolved to. PORT never interprets it.
- `payload` is a value from MESH's boundary data model, or absent. What the payload is for a given event is declared in the application's manifest; how a target interaction produces it is the PORT's realization decision. It is the receiving node's event's payload.

The composer passes the report to `host.dispatch(render, handler, payload)` with the `Render` whose tree was drawn. PORT never sees an intent or a command, and target event objects never leave PORT. A composer that updates through MESH `update` or `updateChanges` releases the previous `Render` (`render.release()`) once its patches are applied.

### Event resolution

MESH defines it (spec §9.9), and every PORT realizes it exactly:

```text
target interaction
   ↓  the PORT's mapping: for each primitive, the one event the interaction constitutes, or none
primitive events
   ↓  MESH's rule: from the interacted node towards the root, the first node whose
   ↓  primitive has an applicable event and which binds it receives the interaction
at most one binding  →  at most one report  →  at most one command intent
```

- **The interacted node** is the innermost node the interaction is on. An interaction on a text run is on its parent node, and an interaction on a node's content is on the node too.
- **The mapping is the PORT's, and only the mapping.** Which target interaction constitutes a primitive's event is target-specific. It depends only on the interaction and the primitive, never on a node's bindings or its ancestors, and it gives a primitive at most one applicable event per interaction. What the event *means* is MESH-level and the same on every target.
- **The walk is MESH's.** No later ancestor is reached, even one binding an event of the same name. Events of different primitives are unrelated whatever their names.
- **A target's own propagation is not it.** A PORT may use its target's mechanisms (DOM capture, delegation, hit testing) to implement the walk, but none of their behavior (phases, bubbling order, other code stopping an event) may change which binding receives an interaction. There is nothing to stop or redirect: MPRX has no propagation-control syntax, and PORT adds none.

## Obligations

A PORT:

1. **Realizes values only as MESH allows** (spec §9.8.7). A value goes either **natively** into a target slot of its own kind that holds it exactly, or **as its MESH text** into a slot that holds only text: a string's own value, or the node's `propText` entry for a number, boolean or `null`. A PORT formats, defaults and converts nothing: no platform coercion, host-language formatting or JSON. A value with no conforming slot (a list or record in a text-only slot, a value of another kind in a native one, or a text-only slot with no MESH text to put in it) is a realization error. An absent prop is realized by omission. Each PORT documents its own slots; the Web PORT's are in its [value realization table](./architecture/2026-09-28-web-value-realization.md).
2. **Surfaces unknown components.** A node whose component the PORT has no realization for is made visible, never dropped.
3. **Drops nothing silently.** Known render-v1 content the PORT cannot realize is an error, not an omission. This is **not** the same as ignoring an unknown schema property; see [What may be ignored](#what-may-be-ignored-and-what-may-not).
4. **Keeps identity.** Between *update*s, each key is realized by the same target object.
5. **Compares keys and handler identifiers only for equality**, and parses neither.
6. **Resolves events as MESH does** ([Event resolution](#event-resolution)): at most one report per interaction.
7. **Depends on neither NEXUS nor the MESH runtime.** It may use the render-tree *types*.
8. **Owns everything target-specific,** including what each of the application's primitive components becomes on its target. MESH has no Valance-wide primitive set: an application's manifest declares its primitives, and the PORT is configured with their realizations.

## What may be ignored, and what may not

Four different situations, each with its own rule. They must not be conflated.

| Situation | Example | The PORT | Why |
|---|---|---|---|
| **Unknown schema property**: a property render-v1 doesn't define | a later MESH adds `"badge"` to nodes | **ignores** it | MESH's schema evolution rule: within a version, MESH may only *add* properties, and "renderers must ignore properties they don't know". MESH's rule 15 makes such additions optional: they "improve realization but [are] never needed for correctness". Ignoring one loses no meaning a v1 renderer is responsible for. |
| **Known content the target can't carry**: a node, prop, event or text run defined by render-v1 that this realization has nowhere to put | children (even an empty text run) under a primitive the Web PORT realizes as a void element like `img` | **refuses** the tree with a realization error | The content has meaning in render-v1. Letting it vanish, or putting it where the target never shows it, is a silent drop. |
| **Unknown component**: a node whose component this PORT has no realization for | a composite whose template the program left out arrives as a primitive of its name | **surfaces** it visibly, and still realizes its children | MESH requires it to be surfaced, not dropped. Its props and events aren't realized; the visible placeholder is how that is made known. |
| **Unsupported realization**: a known component whose prop or event has no realization, or whose value doesn't fit it | a `subtitle` prop the realization table doesn't list; a list for an attribute | **refuses** the tree with a realization error | The configuration is incomplete for this tree, so realizing it partially would drop meaning. |

The first row is about the **format**: it covers only what MESH's evolution rule promises is optional. The other three are about **content** in the format, and nothing in them may disappear silently. An error refuses the whole tree before the target is touched, so what was realized before stays intact.

One case is caught downstream instead: if an event's realization builds no payload where the application's manifest declares one, the PORT can't know (it never sees the manifest), and MESH refuses the dispatch (`runtime-missing-value`). That is surfaced, not silent.

## Not in version 1

These are deliberately absent, because nothing upstream provides them yet or nothing consumes them. Each is an open question in the audit.

- target capability descriptions (no consumer);
- accessibility semantics and styling (render-v1 carries none);
- lists and conditional content as *language* constructs: MESH's `mesh-if` and `mesh-each` are provisional, and PORT realizes whatever keys a tree has, so *update* and *patch* add, remove and reorder parts by key (the contract is MESH §9.10);
- server rendering and hydration as contract operations. They are target-specific: the Web PORT's are described [below](#web-server-html-and-hydrate).

## Web: server HTML and hydrate

Server rendering is a Web realization concern, specified in the [PORT Web SSR design](./superpowers/specs/2026-09-28-port-web-ssr.md). It doesn't change render-v1, MESH or NEXUS, and it isn't a universal PORT operation: a PORT with no server form has none.

- **One realization pipeline.** The server (`realizeHtml` in `@valancex/port-web/server`) and the client share the table validation, the tree check and `realize.ts`. The server only places their outputs as HTML. It makes no text of a value: `propText` stays MESH's.
- **Property vs attribute.** A MESH prop, the DOM property a table realizes it as, and an HTML attribute are three different things. PORT never derives an attribute from a property, even where the browser reflects one. A present value in a DOM property slot has no HTML form, so the server refuses the tree (`unserializable-prop`). An absent one is omitted on both sides.
- **hydrate(tree)** takes over server HTML with nothing drawn (otherwise `already-drawn`). It verifies the whole DOM against the tree without changing it, then adopts it, keeping every server node. On the first mismatch in document order it draws the tree afresh and reports why. When adopted, or after a mismatch, PORT is exactly as after *draw(tree)*, so *update* follows. A tree is fully verified before adoption begins; structural verification is mutation-free. Adoption is not transactionally rollbackable across arbitrary DOM property setters. Hydration verification is mutation-free and atomic. Adoption occurs only after successful verification, but adoption itself is not rollbackable across arbitrary DOM property setters. A setter failure is reported as an adoption failure; PORT does not promise transactional rollback of external DOM side effects. A structural mismatch cannot cause partial adoption, because all verification completes before adoption begins. After an adoption failure (`adoption-failed`) nothing is drawn, and PORT neither undoes the writes already made nor retries. The meanings of *draw* and *update* don't change, and the composer still owns program continuity: it calls *hydrate* for the program it knows the server rendered, and retains the client's own `Render`, never the server's.
- **Events** keep MESH's resolution: hydration installs the same listeners as *draw*. Nothing is reported before hydration, and interactions before it are not replayed. Hydration doesn't preserve input made before it: a slot the client's tree realizes as a present property is written over it. (An absent prop's slot is never written, as for any absent prop.)

## Conformance

Each PORT proves this contract with its own tests, against trees produced by the real MESH runtime where possible, and against small hand-written render-v1 trees for edge cases. The Web PORT's are in [`packages/port-web/test`](../packages/port-web/test), and the full MESH → NEXUS → PORT Web slice is in [`integration/`](../integration).
