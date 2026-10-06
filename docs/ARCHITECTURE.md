# PORT Architecture

This document covers PORT's part of the Valance design: what it's responsible for, what it deliberately stays out of, and the rules that keep it that way. The sibling repos, [NEXUS](https://github.com/ValanceX/Nexus) and [MESH](https://github.com/ValanceX/Mesh), each have their own architecture doc. For the big picture, start at the [ValanceX organization page](https://github.com/ValanceX).

## The short version

> **Valance defines what an application means. PORT determines how that meaning is realized on a target.**

PORT is where Valance meets a real target. It takes the renderer-independent output of MESH (today, render-v1 trees) and **progressively lowers** it into whatever the target runs: DOM and CSS, native widgets, GPU commands, or something else entirely.

A good way to picture PORT is as a compiler backend, not a driver or an adapter. An adapter tries to preserve the source *interface*. A compiler backend preserves the source *meaning* and is free to change the implementation as much as the target rewards. Each PORT is expected to know both Valance semantics and its target deeply, and that is a feature, not a leak.

## What PORT is responsible for

PORT owns **target realization and optimization**. NEXUS and MESH establish what is correct; PORT establishes how to do it correctly and efficiently on one target.

```text
MESH output (render-v1)
        │
        ▼
   PORT lowering
        │
        ▼
 PORT-specific IR(s)       ← as many stages as the target needs
        │
        ▼
target-specific lowering
        │
        ▼
  target runtime  →  host platform  →  hardware
```

Each PORT chooses its own internal pipeline. PORTs do not have to share a strategy:

```text
Web:     MESH → DOM representation → CSS representation → browser
Native:  MESH → native widget representation → platform API → native runtime
GPU:     MESH → render representation → GPU-oriented representation → graphics API
```

A PORT:

- receives MESH render trees that are already compiled, evaluated and renderer-independent, and nothing from NEXUS (see [The boundary](#the-boundary));
- lowers it through whatever representations suit its target, **keeping semantic information (identity, interaction intent, accessibility role, update semantics) for as long as it helps decide something**. Information is discarded by lowering, never hidden early behind an opaque object;
- may specialize aggressively: target scheduling, memory behavior, native widget systems, compositing, event processing, caching, SIMD, hardware-specific paths. Any optimization is valid if it preserves the semantic guarantees established upstream;
- handles the lifecycle of what it realizes: mount, update, and unmount;
- *(direction, not built)* describes its own capabilities (for example `retained-rendering`). PORT is the authority on what its target can guarantee, so MESH never needs an encyclopedia of platforms. Nothing consumes such a description yet, so no format exists (audit U4);
- *(direction, not built)* realizes style semantics in the target's own styling system, always explicitly (e.g. under `@target linux`), never by pretending every target styles alike. render-v1 carries no style or accessibility information yet (audit U1, U2);
- should be **inspectable**: a developer should eventually be able to see what a PORT did with a given element (which target object it became, which optimizations applied) rather than treating it as an opaque engine;
- may offer **explicit escape hatches** down to target primitives and native APIs, clearly marked as leaving the portable layer.

## What PORT is not

- **Not a universal renderer interface.** There is no `createButton()` / `setLayout()` / `handleClick()` API that every target implements. That shape becomes a lowest-common-denominator compatibility prison. The only thing PORTs share is the semantic input they consume.
- **Not an adapter.** "Valance API → platform API" is the wrong mental model; "Valance semantics → target-specific compilation → target-native implementation" is the right one.
- **Not the owner of application semantics.** Improving a PORT should improve realization, not change what the application means.

## What PORT stays out of

- **No business logic.** Rules like "can this cart check out?" live in NEXUS.
- **No language knowledge.** PORT never sees MPRX source or templates. It only ever receives trees MESH has already evaluated.
- **No application capability decisions.** Whether the app has haptics or a camera, and what to do without them, is resolved in NEXUS (see below).
- **No reaching upward.** PORT depends on neither NEXUS nor the MESH runtime (only the render tree's types), and it doesn't push target details back up. Tests check this in `packages/port-web/test/architecture.test.ts` and `integration/test/boundaries.test.ts`.

## Two kinds of capability

Valance separates two questions that are easy to confuse:

| Question | Who answers |
|---|---|
| What can the **device** offer the application (camera, haptics, AI, storage)? And what's the fallback when it can't? | **NEXUS** resolves it once, into typed services, with an explicit strategy for anything unsupported. |
| What can this **target** guarantee when realizing UI (retained rendering, native window decoration, backdrop effects)? | **PORT** will describe it, once something consumes the description. |

```text
Application → NEXUS → detect environment → resolve capability → application receives the result
PORT → describes target capabilities → MESH / tooling reason about them
```

Neither kind turns into scattered `if (device.hasX)` checks in feature or renderer code.

## The boundary

Established from MESH v0.5 and NEXUS v0.8 in the [integration audit](./architecture/2026-09-27-port-integration-audit.md), completed by MESH v0.6's realization and event-resolution rules, and stated as the [PORT contract](./CONTRACT.md).

- **NEXUS → PORT is not a dependency.** NEXUS's `Mesh.host` renders MESH programs into `Render`s. A **composer** (the application, or later tooling) gives PORT each `render.tree`, says whether it comes from the program already drawn, and keeps the `Render` whose tree is drawn. NEXUS and PORT never import each other (NEXUS §16, MESH rule 13).
- **Program continuity is the composer's.** *draw* means "a different program", *update* "the same program". PORT never works this out from keys, handler identifiers, shape or anything else in a tree ([CONTRACT.md](./CONTRACT.md#program-continuity)).
- **In:** render-v1, owned by MESH. PORT doesn't redefine or wrap it. There is no "MESH IR" to consume: MESH's IR is internal to its compiler.
- **Out:** `report(handler, payload?)`. The composer dispatches it through NEXUS with the drawn `Render`. PORT never sees an intent or a command, and target events never leave PORT.
- **PORT → target** is PORT's own business.
- **The application's primitives** are declared in its MESH manifest; there is no Valance-wide primitive set. What each becomes on a target is configuration of that target's PORT (for Web, a realization table).

### Semantics MESH owns, and PORT realizes

MESH v0.6 settled the two questions the first Web realization raised. PORT adopts its answers and adds nothing of its own:

- **A value, its text, and its realization are three steps** (MESH spec §9.7.7, §9.8.7). MESH owns the value and its text: the runtime gives each number, boolean and `null` prop's text as the node's `propText`. PORT owns only which target slot a prop goes to, and puts it there natively (a slot of its kind that holds it exactly) or as MESH's text (a slot that holds only text). PORT never makes a value's text.
- **Event resolution** (§9.9): one interaction reaches at most one binding, the first from the interacted node towards the root whose primitive has an applicable event and binds it. PORT maps its target's interactions onto each primitive's events and implements the walk; its target's propagation never decides the result.

### The Web PORT: DOM properties are not attributes

The Web has two kinds of slot for a prop, and they don't share semantics. An **HTML attribute holds only text**, and `setAttribute` stringifies anything else by the platform's `ToString`, which is not MESH's text. A **DOM property is typed**: an IDL `double` holds a number exactly, an IDL `boolean` a boolean, a `DOMString` only text. So the Web PORT classifies every prop path its realization table names:

| Class | Realization | A value becomes |
|---|---|---|
| native DOM property | `property(name, "boolean" \| "number" \| "value")` | itself, if of the property's kind; anything else is refused |
| native DOM attribute | `booleanAttribute(name)` | a boolean, by presence; anything else is refused |
| text-only slot | `attribute(name)`, `textProperty(name)`, `controlled(name)` (v0.3) | a string's own value, or MESH's `propText`; a list or record is refused. `controlled` is the attribute and the same-named property together, for a field the user edits |
| unsupported | anything not in the table | refused |

A numeric DOM property therefore takes the number natively, while an attribute showing a number takes MESH's text for it. The values, slots, sources, SSR consequences and failures are tabulated in the [Web value realization](./architecture/2026-09-28-web-value-realization.md). One pure step (`realize.ts`) decides every prop's output before anything is written. The Web PORT's server path (`@valancex/port-web/server`) writes the same outputs as HTML rather than formatting values a second way, and never derives an attribute from a DOM property: a present property value has no HTML form, and is refused on the server. Server rendering and `hydrate` are Web-specific, not PORT contract operations ([CONTRACT.md](./CONTRACT.md#web-server-html-and-hydrate)).

What crosses should describe **guarantees, not mechanisms**, so NEXUS and MESH can change internals without breaking PORTs. The evolution rule, in both directions:

- Changing NEXUS or MESH: *did the semantic contract change, or only the implementation?* If only the implementation, PORT should be unaffected.
- Changing PORT: *did target realization improve, or did Valance semantics change?* A PORT should normally improve without changing application semantics.

New information in the semantic output should **improve realization, not become a requirement for correctness**. A PORT that ignores an optional hint must still be correct, and render-v1 requires renderers to ignore properties they don't know.

## Language

The PORT contract is language-neutral: render-v1 is a JSON Schema (MESH implements it natively in Rust and in JavaScript), and the operations are prose. **A PORT's implementation language follows its target.** The Web PORT is TypeScript because the DOM, CSS and browser events are JavaScript-native, and MESH's trees already arrive there as JavaScript objects. A native or WASM PORT may be Rust, consuming `mesh_runtime::Tree` or JSON directly. Nothing here requires a PORT to implement a TypeScript interface.

## Packages

| Package | Role |
|---|---|
| `@valancex/port-web` | Web PORT (DOM): the first target |

There is no shared `@valancex/port` package: the only thing PORTs share is the contract, which is data and prose. The earlier scaffold's `@valence/port` and `@valence/port-canvas` were removed because they implied a shared TypeScript layer with nothing in it (audit, Gate 3). A second target is added only when the first raises a question it would answer; it may be in any language and gets its own package, and PORTs never depend on each other.

## The first PORT is an experiment

We don't design every future PORT up front. The Web PORT is built seriously against a real target, and its job is to reveal which parts of Valance deserve to be stable semantics and which were accidentally target-specific. From there:

1. Define the smallest semantic contract NEXUS and MESH require.
2. Build one serious PORT against a real target.
3. Observe what is genuinely portable, and which assumptions were target-specific.
4. Refine the semantic boundary.
5. Add lower representations only where the target needs them.
6. Add a second target only when the first exposes a concrete architectural question.

Generalize from evidence, not speculation.

## The rules

These invariants keep PORT honest. If a change would break one of them, it probably belongs in another repo.

1. **PORT never owns application or business logic.**
2. **PORTs are replaceable.** Swapping one must not require changes to application logic.
3. **The input is renderer-independent.** The render trees PORT consumes carry no target-specific assumptions, except for rules the application made explicitly target-specific.
4. **No leaks in either direction.** Target details don't leak into NEXUS or MESH, and PORT doesn't reach up into domain code or producer internals.
5. **Optimizations preserve semantics.** A PORT may specialize as far toward the hardware as it likes, as long as every guarantee established upstream still holds.
6. **Optional information is optional.** A PORT is correct without optimization hints; hints only make it better.
7. **Nothing is silently dropped.** Unsupported application capabilities have an explicit strategy, decided in NEXUS; what a PORT cannot realize is refused loudly (in the Web PORT, a `WebRealizationError`), and unknown components are shown, not quietly ignored.
8. **No universal renderer interface.** PORTs share semantic input, not an implementation API.
9. **The language follows the target.** The contract is language-neutral; no PORT is required to be TypeScript.
10. **MESH owns semantic values, their text and event resolution.** A PORT never invents MESH text, and its target's behavior (DOM coercion, event bubbling) never becomes Valance semantics by accident.
