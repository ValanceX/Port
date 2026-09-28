# MESH semantic handoff from PORT

> **Resolved by MESH v0.6** (2026-09-27, `a8a046f`). Both gaps are settled: values by spec §9.7.7, §9.8.2 and §9.8.7 (render-v1 carries semantic values, and each number, boolean and `null` prop's MESH text as `propText`), and events by §9.9. The decisions are in MESH's `docs/superpowers/specs/2026-09-27-mesh-port-semantic-resolution.md`. This document is kept as the record of the question.

**Date:** 2026-09-27
**From:** PORT (ValanceX/Port, branch `claude/focused-keller-jf7dt2`)
**To:** MESH maintainers
**Against:** ValanceX/Mesh `a03733e` (v0.5.0 plus one docs commit, unchanged on `main` at the time of writing), `@valancex/mesh-runtime` 0.5.0, `@valancex/nexus` 0.8.0.

PORT has built a Web realization of render-v1 and run the whole slice (MPRX → MESH → NEXUS → PORT Web → DOM, and back) against the published packages. Two questions came up that PORT can't answer without deciding what an application means, which is MESH's to decide. This document hands them over. It is evidence and questions only: nothing in MESH is changed, and PORT adopts no answer.

The full evidence is in the [event propagation audit](./2026-09-27-event-propagation-audit.md) and the [value realization audit](./2026-09-27-value-realization-audit.md).

---

## A. Facts established by PORT

Shown by MESH's current source, documents and tests, and by PORT's tests.

1. **render-v1 is enough for everything PORT has built.** The Web PORT draws, updates in place by key, and reports events from render-v1 alone, and never imports MESH's runtime code (`packages/port-web/test/architecture.test.ts`). The slice's DOM and intents match MESH's reviewed fixtures (`integration/test/slice.test.ts`).
2. **Program continuity works as MESH specifies, without new data.** The composer tells PORT whether a tree comes from the drawn program (*update*) or not (*draw*). PORT infers it from nothing in a tree. MESH refuses a new program's handler dispatched with an old program's render (`runtime-handler-other-program`), so the composer keeps the drawn render. No program identity is needed in render-v1 (`integration/test/composer.test.ts`; PORT `docs/CONTRACT.md`, "Program continuity").
3. **A binding belongs to one node in every MESH statement.** §4 ("this element emits this event"); a handler identifier "names exactly one handler at one node"; `$event`'s type is that of "the element the `on.` sits on" (§9.5); events are declared per component, with no shared vocabulary (§9.1; manifest). MESH's architecture says "`on.click` is interaction intent, not a DOM event". Propagation is mentioned nowhere, and no checked or evaluated MESH program nests bound nodes (event audit E1–E11).
4. **Today's Web PORT bubbles, as the DOM does.** A click on a bound child also reports a bound ancestor, even across differently named events realized as the same DOM event. This is pinned by characterization tests marked non-contractual (`packages/port-web/test/propagation.test.ts`).
5. **MESH gives text for content, not for props.** §9.7.7 defines the text of interpolations (string, boolean, `null`, absent, number by §9.7.7.1). Props go out "as is" (§9.8.2). Lists and records have no text form by design (§9.7.8). MPRX can't make a string from a number (§9.4: `+` is numeric only). `@valancex/mesh-runtime` doesn't export MESH's number text; the Rust runtime does (`mesh_runtime::number_to_text`).
6. **Renderers must not format.** "It computes nothing: it doesn't format numbers, supply a missing prop, or convert values. Values are final" (runtime manual).
7. **So a non-string prop in a text slot can't be realized.** A number, boolean-as-text, `null`, list or record prop in an HTML attribute, and so in server-rendered HTML, has no text PORT may use. The Web PORT refuses each case (`unrealizable-value`; `packages/port-web/test/port.test.ts`).

## B. Semantic gaps owned by MESH

### B1. Event propagation

MESH doesn't say how many bindings one user interaction triggers, or which interactions a primitive's event covers. Specifically:
- **Multiplicity:** with a bound node inside a bound node, does one interaction on the inner node trigger one binding or both? The same question arises on one node that binds two events a target realizes with one interaction (MESH's own fixtures bind `tap` and `click`, or `click` and `press`, on one node).
- **Relation:** if an ancestor can be triggered, by what relation? Events are per component, so "the same event" has no current meaning between two components.
- **Extent:** is an interaction on a node's content an interaction with the node, for example a click on a button's label?

It is MESH's because it changes which intents reach the application, and must be the same on every target (event audit, "Why PORT can't decide this").

### B2. Value realization

MESH doesn't say what a prop's value becomes where a target can hold only text, or whether it may be placed there at all. The per-value, per-context matrix is in the [value realization audit](./2026-09-27-value-realization-audit.md#handoff-matrix). In short: strings are defined everywhere; every other kind is defined in content (or excluded from it) and "as is" for props; and **no rule covers a non-string prop in a text slot**.

## C. PORT consequences

**PORT can implement now, without new semantics:**
- DOM realization of strings (attributes and text), booleans by presence where a realization table chooses it, text runs, identity, in-place updates, and program continuity. All of this is built.
- Event *reporting*: handler identifier and payload, dispatched by the composer with the drawn render. Also built.
- DOM *property* realization of values the property takes natively (a number into a numeric property), if an application needs it. It isn't built, since nothing needs it, and such values have no HTML form in any case.

**PORT cannot implement until MESH decides:**
- any text for a number, boolean-as-text, `null`, list or record prop: attribute realization of these stays refused;
- server-rendered HTML for any tree containing such a prop in an attribute;
- a propagation behavior that is *contractual*. The Web PORT keeps the DOM's bubbling as a characterized implementation fact, not Valance semantics, and applications must not rely on it.

PORT will not fill either gap with a Web-specific fallback (`String(x)`, `JSON.stringify`, `"[object Object]"`, ad-hoc number formatting, a propagation abstraction), because each would become a second, Web-only interpretation of MESH semantics.

## D. Why SSR and hydration stay paused

1. **Server HTML is attributes and text.** Every prop realized as an attribute must become text on the server. For a string that is escaping; for every other value kind the representation is the open question B2. Rendering one anyway would be PORT defining MESH values' text.
2. **Hydration depends on the same rule.** Adopting server markup means checking that the server's attributes match the tree the client renders. That comparison needs the same value → text rule as the server. Without it, no non-string attribute can be verified, and a mismatch can't be told from a representation difference.
3. **Hydration activates events.** Attaching listeners to adopted markup inherits B1. It doesn't block producing HTML, but a hydrated application's interactions would carry the same unspecified propagation as today's client rendering.
4. **Nothing else blocks.** The information hydration needs exists: the program (the composer knows it), the snapshot the server rendered (the server's composer has it), and MESH's determinism ("identical inputs give identical results"). Program continuity carries over unchanged. SSR is paused on B2 (and hydration's interactive half on B1) only.

## E. Required MESH decisions

### The fundamental value question

> **Does render-v1 carry *semantic values* that PORT must realize, or values that have *already been semantically realized* for the relevant output position?**

The consequences of each interpretation, as far as the evidence goes:

| | **Semantic values**: PORT realizes them, by a MESH-defined representation | **Already realized** for their output position |
|---|---|---|
| **What MESH must add** | A representation for each value kind in a text position, available to every PORT, in each PORT's language (today only Rust has MESH's number text) | A notion of "output position" that render-v1 lacks: a tree records a primitive's name and a prop's value, not the prop's declared type or its target slot. Otherwise "already realized" can only mean "a text slot takes strings only" |
| **Web DOM** | Attributes take every kind through the representation; typed properties take values natively | Today's behavior is complete: attributes take strings, and everything else is refused |
| **SSR** | Possible once the representation exists; server and browser paths must apply the identical rule | Possible now for strings and boolean presence. A non-string prop can never be an attribute: an application must supply text itself, and since MPRX can't make text from a number (§9.4), the host must, which moves formatting into application state |
| **Hydration** | Mismatch detection compares server text with the tree through the same representation | Compares strings directly |
| **Other PORTs** | Each needs the representation in its own language, or MESH's implementation of it | A native PORT with typed setters realizes numbers natively, while a text-only target can't. Which props are "text positions" then differs per target, which sits uneasily with values already realized for their position |

**Structural finding.** render-v1 currently carries **neither a prop's declared type nor its target or output slot**: a node has a primitive's name, and each prop a name and a value. So the "already realized for their output position" interpretation can't be implemented from the current contract alone. PORT doesn't add either piece of information: if MESH decides it is needed, the change originates in MESH's semantic and runtime contract.

### Value questions

- **V-Q0.** The fundamental question above.
- **V-Q1.** When a target needs text for a number, boolean or `null` prop, what is it, and who produces it: MESH, the host, or the PORT by a MESH rule?
- **V-Q2.** Is a `null` prop in a text slot text, omission (making it equal to absent, which MESH otherwise keeps distinct), or unrealizable?
- **V-Q3.** Can a list or record prop ever occupy a text slot? Is a structural lowering chosen per primitive (a list of strings as `class` tokens) realization, or invented text?
- **V-Q4.** Is a target's own conversion (a DOM `DOMString` property given a number, whose text may differ from §9.7.7.1 in the last digit) realizing the value as given, or forbidden formatting?
- **V-Q5.** The rendering guide says "Don't format a number (MESH already turned it into text, by its own rule…)". That holds for text runs, not props (value audit VC1). Should it say so?

### Event questions

- **E-Q1.** May one user interaction trigger more than one binding: on nested nodes, and on one node binding several events?
- **E-Q2.** Can an interaction on a descendant trigger an ancestor's binding: never, only when no nearer node binds it, or always? And under what relation between two components' events, since events are per component?
- **E-Q3.** Which interactions does a primitive's event cover (for example, its content)? Is that MESH's to define, or explicitly left to each PORT's realization of the primitive?
- **E-Q4.** If the answer lets an application choose, for example to stop propagation, does MPRX need a way to express it? A handler today is exactly one command invocation (§9.5).

## Not asked of MESH

- **Program identity in render-v1:** not needed (A2).
- **Any change to the host/renderer split, or a PORT dependency on NEXUS or on MESH's runtime:** none needed.
- **Target capability descriptions:** still no consumer. Out of scope here.
