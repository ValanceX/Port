# PORT integration audit

**Date:** 2026-09-27
**Scope:** Gates 0–4 of the PORT integration kickoff: what PORT is, what crosses its boundaries, what (if anything) belongs in a shared package, the language question, and the package namespace.

**Evidence examined**

| Repository | Revision | What was read |
|---|---|---|
| ValanceX/Port | `778f7f3` (scaffold) | every file: README, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, the three packages, workspace and build config |
| ValanceX/Mesh | `a03733e` (v0.5.0 + one docs commit) | README, `docs/ARCHITECTURE.md`, `docs/manual/runtime.md`, `docs/guides/rendering-mesh-output.md`, `schemas/render-v1.schema.json`, `packages/mesh-runtime` (types, API, README), `examples/slice/`, the reference renderer in `crates/mesh-runtime/tests/common/renderer.rs` |
| ValanceX/Nexus | `bc2f384` (tag `v0.8.0`; published to npm as `@valancex/nexus@0.8.0`) | `package.json`, `src/index.ts`, `src/mesh/index.ts`, `docs/ARCHITECTURE.md` §15, §16, §24–26, `docs/ROADMAP.md` §10–17, `tests/mesh.test.ts`, `tests/vertical-slice.test.ts` |
| ValanceX/.github | `main` | `profile/README.md` |
| npm registry | 2026-09-27 | published versions of `@valancex/*` and `@valence/*`, rechecked after NEXUS's release |

Nothing in this audit relies on a document that current source contradicts, unless the contradiction is listed below.

---

## Facts

Only what current source, tests, schemas or the registry demonstrate.

### F1. PORT is an empty scaffold

- `packages/port/src/index.ts`, `packages/port-web/src/index.ts` and `packages/port-canvas/src/index.ts` are each `export {};`.
- There are no tests, no test runner, no CI workflow, and no lockfile.
- `port-web` and `port-canvas` depend on `@valence/port` (`workspace:*`). `@valence/port` has no dependencies.
- `port-canvas` and `port-web` compile with `lib: ["ES2022", "DOM"]`; `port` with `lib: ["ES2022"]`.

### F2. What MESH gives a renderer: render-v1

`schemas/render-v1.schema.json` and `docs/manual/runtime.md` define it. A render tree is `{ format: "mesh-render", version: 1, root }`, where:

- a **node** is `{ type: "node", key, component, props, events, children }`: a *primitive* component name, each written prop's final value, each bound event's opaque handler identifier, and ordered children;
- a **text run** is `{ type: "text", key, text }`, present even when empty;
- **values** are the boundary data model: `null`, boolean, finite number (never `-0`), string, list, record. An absent prop has no entry; `null` is `null`;
- **composites never appear**; they are expanded by the runtime;
- **keys** are opaque structural identities: unique in a tree, the same at the same position in every render of one program, independent of values, and *not* stable across programs. They are not data or application identity.
- The schema is additive within a version: "Renderers must ignore properties they don't know."

The tree contains nothing else: no expression, scope, command, argument, composite name, template, span or `$event`.

### F3. Renderer obligations are already specified, by MESH

`docs/manual/runtime.md` ("What renderers and hosts must do") and `docs/guides/rendering-mesh-output.md` require a renderer to:

1. draw each node's component with its props, and each text run's text, **as given**. It computes nothing: it doesn't format numbers, default a missing prop, or convert values;
2. report an event as its **handler identifier and payload**, and never interpret either;
3. compare keys only for equality, and reconcile by key **only between trees its host says come from one program**;
4. **surface** a node of a component it doesn't know, rather than dropping it.

And a host to: keep each render while its tree is drawn; dispatch each event with the render whose tree was drawn; **tell the renderer when a new tree comes from a different program**.

### F4. Structure is fixed per program

MPRX has no loops and no conditional elements (runtime manual, "The render tree"): "a program's render trees all have the same structure, whatever the snapshot. Only prop values and text differ." Within one program, there is no insertion, removal or reordering to realize.

### F5. Updates are whole trees

"A change of values is a new render" (runtime manual, "Updates"). The runtime does no dependency tracking and no diffing: "Finding what changed is the renderer's job."

### F6. The component vocabulary is per application

The manifest (`examples/slice/components.json`) declares every component, primitive or composite, with its props, events and event payload types. A component is a composite exactly when the program includes a template for it. **There is no Valance-wide set of primitives.** `page`, `text`, `avatar` and `button` in the slice are that application's primitives.

Event payload types are declared in the manifest: in the slice, `avatar`'s `click` carries `Press = { x: number, y: number }`, and `button`'s `click` carries nothing.

### F7. The render tree carries no accessibility, style or capability information

render-v1 has no roles, accessible names, style properties, or target hints. MESH's `docs/ARCHITECTURE.md` "Direction: semantics, not implementations" (commit `a03733e`) lists accessibility intent, portable style concepts and target capability reasoning as *direction*, and states: "None of this is implemented yet beyond templates and render trees."

### F8. NEXUS hosts MESH; it does not talk to PORT

`src/mesh/index.ts` (`Nexus.Mesh.host`) exposes:

```ts
host.render    // Effect<Render, MeshDiagnostics>          the current value
host.renders   // Stream<Render, MeshDiagnostics>          one per future commit
host.dispatch(render, handler, payload)
               // Effect<Dispatched, MeshDiagnostics | UnmappedCommand | E, R>
```

A `Render` (from `@valancex/mesh-runtime`) holds the tree plus the program, model and snapshot it came from. Invariants M1 (dispatch uses exactly the supplied `Render`) and M2 (the adapter retains no render) put keeping the drawn render on **the caller**.

`docs/ARCHITECTURE.md` §16: "NEXUS must have no dependency on PORT, and … **PORT must have no dependency on NEXUS either.** PORT only ever sees MESH **render trees** … Whoever composes the app hands PORT render trees and routes PORT's events back to the adapter's `dispatch`, together with the `Render` they came from." `PORT → NEXUS` is listed as an invalid dependency direction.

MESH `docs/ARCHITECTURE.md` rule 13: "PORT's renderers [depend] on MESH's render-tree types. NEXUS and PORT don't depend on each other."

### F9. The render-tree types are published only inside the runtime package

`@valancex/mesh-runtime@0.5.0` (on npm) exports `RenderTree`, `RenderNode`, `TextRun` and `BoundaryValue` as types, alongside the runtime itself (WebAssembly). MESH's guide: "A renderer imports only the tree's types, never the runtime."

### F10. MESH ships a reference renderer, test-only

`crates/mesh-runtime/tests/common/renderer.rs` prints a tree as HTML-like text and compares trees key by key. It is not a PORT and makes no DOM decisions; `examples/slice/expected/first.html` is its output.

### F11. Implementation languages today

- MESH: Rust, with the runtime and compiler also built to WebAssembly and wrapped for JavaScript. The render tree exists natively as `mesh_runtime::Tree` in Rust and as frozen objects in JavaScript; its contract is a JSON Schema.
- NEXUS: TypeScript on Effect.
- PORT: TypeScript scaffold, no code.

### F12. Namespaces

| Where | Namespace |
|---|---|
| MESH npm packages (`packages/*/package.json`) | `@valancex/mesh-compiler`, `@valancex/mesh-runtime`, `@valancex/mesh-lsp` (+ platform packages) |
| NEXUS `package.json` | `@valancex/nexus` |
| npm registry | `@valancex/mesh-compiler` 0.4.0, 0.5.0, `@valancex/mesh-runtime` 0.5.0 and `@valancex/nexus` 0.8.0 are published. `@valancex/port` and `@valence/port` are not |
| PORT packages | `@valence/port`, `@valence/port-web`, `@valence/port-canvas`; workspace root `valence-port-workspace` |
| PORT `docs/ROADMAP.md` Phase 0 | "Package direction: `@valancex/port`, `@valancex/port-web`, `@valancex/port-canvas`" |
| GitHub organization | `ValanceX` |

### F13. NEXUS is installable from npm

`@valancex/nexus@0.8.0` is published to npm (NEXUS's Release workflow, 2026-09-27), from tag `v0.8.0` at `bc2f384`, the revision this audit read. It depends on `@valancex/mesh-runtime ^0.5.0` and `effect ^3.10.0`, and on nothing from PORT. Its `exports` expose only `.`. So PORT's vertical slice uses NEXUS as any application would, from the registry, with no source checkout or contract fixture standing in for it.

---

## Architectural requirements

What PORT must provide, derived from the facts above rather than from PORT's own earlier documents.

**R1. Consume render-v1 trees, and only render-v1 trees** (F2, F8). PORT's input is a MESH render tree. Not a `Render`, not a NEXUS handle, not templates, not a manifest.

**R2. Accept the host's program-change signal** (F3). The host must say whether a tree comes from the program already drawn. PORT needs two distinct operations: *update* (same program: reconcile by key) and *draw afresh* (first tree, or a different program). This is the only control information that crosses in.

**R3. Report interactions as `(handler identifier, payload)`** (F3, F8). PORT reports and never interprets. The payload is a boundary value or absent. The composer pairs the report with the drawn `Render` and calls `host.dispatch`. PORT never sees an intent or a command.

**R4. Realize values as given** (F3). No number formatting, defaults, or conversion. Where a target can only hold text (an HTML attribute, serialized HTML), a non-text value has no given text; see U3.

**R5. Surface unknown components** (F3, F6). Since the vocabulary is per application, PORT can meet a component it has no realization for. It must make that visible.

**R6. Own the realization of the application's primitives on the target** (F6). Nothing upstream says what `avatar` is in a browser, or how a DOM click becomes a `Press` payload. That knowledge is target-specific and per application (or per design system), so it belongs to the target PORT, supplied as its configuration. It is not a Valance-wide primitive set, and it is not a universal renderer interface.

**R7. Maintain semantic identity → target identity** (F2, F4). Within a program, a key maps to one target object for as long as the tree is drawn. Updates change that object in place.

**R8. Depend on neither NEXUS nor the MESH runtime** (F8, F9). Type-level dependence on the render-tree types is sanctioned; importing runtime values is not.

**R9. Handle lifecycle: draw, update, unmount** (F3, F5). Unmount must also stop reporting events.

---

## Gate 0: what PORT is

**Conclusion: a target backend (a realization layer).** It is not a driver.

- A *driver* exposes a fixed, target-independent operation set (`createElement`, `setAttribute`, …) that a higher layer programs against. Nothing upstream programs PORT: MESH hands it finished trees (F2), NEXUS never calls it (F8), and MESH's renderer obligations (F3) constrain what PORT may do with a tree, not how it does it.
- What PORT decides (R6: what a primitive becomes on the target, how a target event becomes a payload, how identity maps to target objects) is exactly a backend's job: lower a target-independent representation onto one target.
- The word "driver" appears nowhere in MESH or NEXUS; PORT's own ARCHITECTURE already rejects it. The working hypothesis stands, on evidence.

One refinement: MESH's documents call PORT's components **renderers** and specify their obligations. "Renderer" there means "the consumer of a render tree", not a shared renderer interface. A target PORT *contains* a renderer in MESH's sense; it may contain more (a server path, hydration).

## Gate 2: the boundary

### What crosses NEXUS → PORT

**Nothing crosses directly.** NEXUS §16 and MESH rule 13 both forbid a dependency in either direction (F8). The pipeline arrow `NEXUS → PORT` is data flow through a **composer**: whoever assembles the application. The composer:

1. takes a `Render` from `host.render` / `host.renders`;
2. gives PORT **`render.tree`** (render-v1), with **the program-change signal** (draw afresh, or update);
3. keeps that `Render` while its tree is drawn.

So the entire inbound boundary is: **a render-v1 tree + "same program as the drawn tree, or not"**.

### What crosses PORT → NEXUS

Again via the composer: PORT reports **`(handler identifier, payload | absent)`**; the composer calls `host.dispatch(keptRender, handler, payload)`. NEXUS turns the intent into a command through its explicit bindings (M3). Browser events, DOM nodes and target objects never leave PORT.

### What crosses PORT → target

Target-specific and PORT-internal. For Web: DOM nodes, attributes, properties, listeners (browser path); HTML text (server path, not yet built). No other layer sees it.

### Which kinds of contract PORT needs

| Candidate | Needed now? | Owner | Evidence |
|---|---|---|---|
| Data contract (input) | yes | **MESH** (render-v1) | F2. PORT must not redefine it |
| Protocol (draw / update / report) | yes, tiny | PORT, derived from MESH's host/renderer obligations | R2, R3, R9 |
| TypeScript library | only for the Web PORT | `port-web` | Web target is JavaScript-native (Gate 3) |
| Runtime | per target, internal | each PORT | nothing shared |
| Target-specific APIs | yes, Web only | `port-web` | R6: primitive realization table |
| Capability descriptions | **no** | — | No consumer exists: NEXUS L1 says target capabilities "would be a separate binding", unbuilt; MESH says tooling "may" reason about them, unbuilt (F7) |
| Lifecycle API | yes | per PORT | R9 |
| Event API | yes: the report | per PORT, shape fixed by MESH's dispatch inputs | R3 |
| Update API | yes: update vs draw afresh | per PORT, semantics fixed by MESH | R2, F4, F5 |

## Gate 3: language and runtime

**A. Does the boundary need to be executable TypeScript?** No. The input is a JSON Schema (render-v1) that MESH already publishes and implements in Rust and JavaScript (F11). The protocol is three operations and one report; they can be stated as prose.

**B. Can it be a language-neutral data contract?** It already is. The stable Valance-level contract is render-v1 plus the renderer/host obligations in MESH's runtime manual. PORT's contribution is to state the protocol (R2, R3, R9) language-neutrally: [`docs/CONTRACT.md`](../CONTRACT.md).

**C. What is inherently Web-specific?** Mapping primitives to elements, props to attributes/properties, events to DOM listeners and payload construction; DOM node identity; event listener lifecycle; later, HTML serialization and hydration. All of it lives in `port-web`.

**D. Would a TypeScript `packages/port` force a bad abstraction on a Rust/WASM/native PORT?** Yes, if it held executable code. A Rust PORT would consume `mesh_runtime::Tree` or JSON directly; it cannot implement a TypeScript interface, and a JavaScript shim around it would exist only for symmetry. The scaffold's `@valence/port` described itself as "the semantic input a PORT consumes and its capability description". The first is MESH's render-v1, and the second has no consumer.

**E. Does the current structure imply "all PORTs implement a TypeScript renderer interface"?** Yes, implicitly. Every target is an npm package depending on a shared TypeScript package (`port-web → port`, `port-canvas → port`), and the Canvas placeholder is an empty TypeScript package created for symmetry. Neither the dependency nor the placeholder carries any code or evidence.

**Conclusion.**
- The shared PORT contract is **language-neutral**: render-v1 (MESH-owned) plus the protocol in `docs/CONTRACT.md` (PORT-owned). Its conformance evidence is tests in each PORT, and MESH's own fixtures.
- **`@valancex/port` is not created.** There is nothing executable to share, and inventing a shared package now would constrain future PORTs without evidence. It may be introduced when a second PORT (in any language) demonstrates shared code worth publishing.
- **`port-canvas` is removed.** It had no code and its only effect was to imply symmetry. The roadmap keeps Canvas as a deferred *question*, not a package.
- **The Web PORT is TypeScript** because its target (DOM, CSS, browser events) is JavaScript-native, and its inputs already arrive as JavaScript objects (the runtime's frozen trees). A Rust/WASM Web PORT would still have to call the DOM through JavaScript glue, and nothing on the evidence rewards that cost. This is a Web decision, not a PORT-wide one.

## Gate 4: namespace

**Conclusion: rename to `@valancex/*`.** MESH and NEXUS use `@valancex` (F12), the only published Valance packages are under `@valancex`, the organization is `ValanceX`, and PORT's own roadmap names `@valancex/port*`. `@valence` looks like a misspelling of Valance, with nothing published under it. The smallest consistent change: rename `@valence/port-web` → `@valancex/port-web` and the workspace root `valence-port-workspace` → `valancex-port-workspace`, and add `repository` metadata as MESH does. (`@valence/port` and `@valence/port-canvas` are removed per Gate 3, not renamed.)

---

## Assumptions

Believed, not proven.

- **A1.** The composer will be application or tooling code, not a fourth package. NEXUS §16 says "whoever composes the app". No composer package exists and none is proposed here.
- **A2.** A primitive realization table supplied to the Web PORT is the right place for per-application primitive knowledge (R6). The alternative, a standard Valance primitive vocabulary defined by MESH, doesn't exist today (F6), and PORT must not invent one.
- **A3.** Direct listeners per element are adequate for the first Web PORT. Delegation is an optimization with no evidence yet.
- **A4.** `@valancex/mesh-runtime`'s exported types are the intended way for a TypeScript renderer to name render-v1 (F9). Depending on it as a peer (types only) keeps PORT aligned with the host's MESH version.

## Unknowns

To remain unresolved until evidence arrives.

- **U1. Accessibility semantics.** render-v1 has none (F7). Whether they come as manifest-declared primitive metadata, as new render-tree properties, or stay in the Web realization table is a MESH decision. PORT Web can only realize what primitives and props give it.
- **U2. Styling.** Same as U1. No portable style concept crosses today.
- **U3. Non-text values in text-only target slots.** *Audited in [`2026-09-27-value-realization-audit.md`](./2026-09-27-value-realization-audit.md), with a per-value, per-slot table: a MESH contract gap that blocks SSR.* A number, list or record prop has no MESH-given text. The DOM can take a number as a *property* (the browser converts it), but an HTML attribute or SSR output needs text, and PORT is forbidden to format numbers (F3). MESH gives number text only for text runs (§9.7.7). PORT Web currently refuses non-text values in attribute slots loudly. Whether MESH should provide text for such props is a question for MESH.
- **U4. Target capability descriptions.** No consumer exists (Gate 2), so no format is defined.
- **U5. Lists and conditionals.** F4 holds only while MPRX has no loops or conditional elements. MESH says "a later design for lists may extend [keys]". Insertion, removal and reordering are unspecified until then.
- **U6. Payloads beyond the slice.** How each primitive's event payload is built from a DOM event is currently decided per realization table. Whether some payload shapes deserve standard Web realizations needs more applications.
- **U7. How the composer learns the program changed.** A MESH `Render` does not expose its program identity (it's "never given to a renderer"). A composer that swaps programs knows because it did so; hot reload tooling (NEXUS roadmap §15) will need to track it.
- **U8. SSR state transfer.** Dispatch needs a `Render`, so a hydrating client must obtain one by rendering the serialized snapshot itself (see ROADMAP). Whether snapshot serialization is the composer's or NEXUS's is open (NEXUS roadmap §14 lists serialization and hydration as v0.10 investigations).
- **U9. Event propagation.** MPRX says nothing about whether an event on a nested node also counts for its ancestors' bindings. PORT Web keeps the DOM's default (bubbling), so a click on a node inside another node that binds `click` reports both. **Audited** in [`2026-09-27-event-propagation-audit.md`](./2026-09-27-event-propagation-audit.md): local binding is better supported, but it is a MESH contract gap, and V0.3 is not semantically complete.

## Contradictions

Recorded, not silently resolved. Where this kickoff changes PORT's own documents, the resolution is stated.

- **C1. PORT docs vs NEXUS/MESH: "MESH IR".** PORT's README, and the org profile, show `MESH compiler → MESH IR → NEXUS runtime → PORT`. MESH has no public IR ("The Semantic IR itself stays internal to the compiler"); NEXUS decision 7 replaced "Semantic IR" with templates, render trees, `Render` and intents. **Resolved in PORT's docs**; the org profile is outside this repository and is left as is.
- **C2. Kickoff pipeline vs NEXUS §16.** The kickoff draws `render-v1 → NEXUS → PORT`. In code, MESH's runtime is called *by* NEXUS's adapter, and PORT must not depend on NEXUS. The arrow is data flow through a composer, not a dependency or call (Gate 2). PORT follows NEXUS §16.
- **C3. PORT ARCHITECTURE "describes its own capabilities" vs evidence.** PORT's ARCHITECTURE listed capability description as a PORT responsibility and gave `@valence/port` "the shape of a capability description". Nothing consumes one (U4). **Resolved:** kept as future direction, removed from current contracts.
- **C4. `@valence` vs `@valancex`** (F12). **Resolved** by Gate 4.
- **C5. Scaffold structure vs "no universal renderer interface".** PORT's docs forbid a universal renderer interface, while the package graph makes every target depend on one shared TypeScript package (Gate 3 E). **Resolved** by Gate 3.
- **C6. Org profile lists PORT's language as "TypeScript".** The kickoff states PORT's implementation language follows the target. True today for `port-web` only. The org profile is outside this repository; flagged, not changed.
- **C7. MESH `docs/ARCHITECTURE.md` "PORT describes target capabilities, and MESH may reason about them" vs render-v1.** MESH's direction expects information to flow from PORT to MESH tooling, but there is no channel for it in any current format. Direction only; no action.
- **C8. PORT ROADMAP V0.1 "Do not simply expose the MESH IR wholesale … PORT should consume the semantic guarantees it actually needs."** There is no MESH IR to expose, and render-v1 is already the minimal, guarantee-shaped output MESH designed for renderers. PORT consumes it as is, rather than defining its own input format. **Resolved** in the roadmap.
