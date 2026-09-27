# Event propagation audit

**Date:** 2026-09-27
**Question:** when nodes are nested and more than one binds an event, which bindings does one user interaction trigger?

```text
<card on.click={a()}>          a click on the button:
  <button on.click={b()} />      A: b, then a      (bubbling)
</card>                          B: b only         (local binding)
```

**Evidence examined:** ValanceX/Mesh at `a03733e` (v0.5.0 plus one docs commit; unchanged on `main` at the time of writing): `docs/MPRX-SPEC.md` §4, §9.1, §9.5, §9.8, §10; `docs/manual/runtime.md`; `docs/manual/manifest.md`; `docs/ARCHITECTURE.md`; `docs/guides/rendering-mesh-output.md`; `schemas/render-v1.schema.json`; every `.mprx` under `examples/` and `crates/mesh-runtime/tests/programs/`; the test host `crates/mesh-runtime/tests/common/host.rs` and its `events.json` files. NEXUS v0.8 `src/mesh/index.ts`. PORT `packages/port-web` at this commit.

**Conclusion, briefly:** MESH doesn't specify propagation. The evidence consistently treats a binding as belonging to one node, and nothing supports bubbling, so **local binding is the better-supported reading**. But it is not a stated rule, so this is a **MESH contract gap**. PORT's V0.3 (events) is not semantically complete until MESH closes it. The Web PORT's current behavior (the DOM's bubbling) is characterized by tests and documented as not contractual. It is not Valance semantics.

---

## Facts

What MESH currently specifies, and doesn't.

- **E1. A binding is a declaration about one element.** §4: "an event binding is a declaration (this element emits this event, handle it with this expression)".
- **E2. A handler identifier names one handler at one node.** Runtime manual: "A handler identifier names exactly one handler at one node. It is determined by the program's identity, the node's key and the event's name."
- **E3. Dispatch turns one handler identifier into one intent.** `dispatch(render, handler, payload)` returns one command intent. NEXUS's `host.dispatch` maps one intent to one command through one binding (M3).
- **E4. The payload belongs to the node's own event.** §9.5: `$event`'s type "is the payload of the handled event, as declared by the component of the element the `on.` sits on". §9.8.4: a payload is checked "against the payload type of the event the handler is bound to".
- **E5. Events are per component, not a shared vocabulary.** The manifest declares `events` inside each component, with each its own payload. §9.1: props, events, commands and scope names are separate namespaces per component. §4: "there is no registry of known DOM/runtime events". `avatar`'s `click` (payload `Press`) and `button`'s `click` (no payload) in the slice are two unrelated declarations that share a name.
- **E6. An event's meaning is only its name and payload.** A manifest event is `{}` or `{ "payload": T }` (manifest manual, "Events"). Nothing states which interactions a primitive's event covers: for example, whether a click on a node's content is a click on the node.
- **E7. `on.click` is not a DOM event.** MESH `docs/ARCHITECTURE.md`, "Direction": "`on.click` is interaction intent, not a DOM event."
- **E8. The renderer reports; it doesn't interpret.** Runtime manual: a renderer "reports an event as its handler identifier and payload, and never interprets either". The guide: "When the user does something, report the node's handler identifier for that event". It is singular throughout, and nothing says how many reports one interaction yields.
- **E9. Composites have no events** (§10, `assembly-composite-event`). There is no event forwarding or re-emission between components.
- **E10. MESH never evaluates nested bindings.** The only MPRX in the MESH repository where a bound node has a bound descendant is a Tree-sitter highlighting sample, `grammar/tree-sitter-mprx/test/captures/events.mprx` (`<list on.select=…>` around `<button on.click=…>`). It pins syntax colouring only, and is never checked or evaluated. No example, check fixture or runtime test program nests bindings. MESH's test host (`tests/common/host.rs`) fires an event by picking *one* node binding it (`occurrence`) and dispatching *once*.
- **E10a. One node may bind several events.** `crates/mesh-runtime/tests/programs/greeting/view.mprx` gives one `probe` both `on.tap` and `on.click`, and `examples/fixtures/check/pass/resolution.mprx` gives one `button` both `on.click` and `on.press`. MESH tests each by dispatching one at a time. Whether one user interaction may trigger two of *one node's* events is the same multiplicity question (Q1 below), on a single node.
- **E11. The words "bubble", "propagate", "capture", "ancestor" (for events) and `stopPropagation` appear nowhere** in MESH's spec, manuals, guides, architecture or specs.
- **E12. Today's Web PORT bubbles, across event names.** `packages/port-web/test/propagation.test.ts` shows: a click on a bound child reports the child's then a bound ancestor's handler; differently named events realized as the same DOM event type (`tap` and `select`, both `click`) both report; and a click on unbound content reports the nearest bound ancestor. This is the DOM's default, not a decision anyone made.

## Options

Two questions are tangled here, and each option answers both.

- **Q1, multiplicity:** can one user interaction produce more than one report, and so more than one intent and command?
- **Q2, extent:** which interactions count as a node's event? For example, is a click on a button's label a click on the button?

Q1 also arises on one node (E10a): if a realization maps two of a node's events to the same target interaction (both `click` and `press` to a DOM `click`), one gesture reports both. That mapping is the realization table's choice, so PORT can avoid it. But whether it is *wrong* is Q1.

### A. Bubbling

Every bound node from the interaction's target up to the root reports, innermost first.

- One gesture can cause several commands, in child-to-parent order, each dispatched separately. NEXUS runs them as independent commands, with no atomicity between them.
- An ancestor's handler fires for a descendant's interaction, so an application needs a way to stop it (as the DOM has `stopPropagation`). MPRX has none: a handler must be a single command invocation (§9.5), so a template couldn't express "handle here only".
- It needs a relation between events of *different components* ("a click on `button` is also a click on `card`"). By E5 there is none, since each component's `click` is its own declaration. A must either key on the event *name* (making names a global vocabulary, which §9.1 denies) or on the *target's* event type (which makes it Web-specific, per E12's cross-name case).
- The ancestor's payload is its own event's type (E4), but the interaction happened on a descendant. What the ancestor's payload is, for example coordinates relative to which node, would need defining.

### B. Local binding

An interaction triggers at most one binding per event: the node the interaction belongs to.

- **B1, nearest bound node:** the innermost node, from the interaction's target up, that binds an event covering the interaction reports it, and nothing else does. A click on a button's label is the button's click (the label binds nothing); a click on a bound button inside a bound card is only the button's.
- **B2, target only:** only the node that is the interaction's own target reports. A click on a button's label reports nothing, which breaks any primitive with content (a button with a text or icon child). B2 is listed for completeness, and nothing supports it.

Under B, one gesture is one report, one intent and one command. It matches E1 to E4, E8 and E10 directly. Q2 (extent) still needs an answer: B1 answers it structurally ("the innermost bound node containing the target"), but whether a primitive's event covers its content is still a property of the primitive (E6), which MESH doesn't describe.

## PORT consequences

| | A: bubbling | B1: nearest bound node |
|---|---|---|
| **Web** | What the DOM does, with direct listeners: no work. But the PORT is then deciding which events relate: today, DOM event *type*, so unrelated MESH events bubble into each other (E12). And it needs a propagation-stop mechanism MPRX lacks. | Each realized listener stops the interaction from reaching ancestor *realized bindings* once reported: for example, the PORT marks the DOM event as handled, and ancestors' listeners skip handled events. This must not use `stopPropagation`, which would hide the event from non-Valance code on the page. Same-type listeners on one node need an order rule. |
| **SSR / hydration** | No effect on markup. Hydration attaches the same listeners. | No effect on markup. |
| **A non-Web PORT** (native toolkit, Canvas) | Must emulate DOM-like bubbling: hit-test, then walk ancestors and report each bound one. A native toolkit whose widgets consume events (most do) must re-dispatch to ancestors itself. | Natural for toolkits whose widgets consume events, and for Canvas: hit-test, then find the innermost bound node. |
| **Multiplicity at the composer** | One gesture → n reports → n dispatches, each with the same drawn render. | One gesture → one report. |
| **Relation between events** | Must be defined: by name (global vocabulary) or by target event type (target-specific semantics). | Not needed. |

In both cases Q2 (extent) is currently answered by each PORT's realization of the primitive: the Web PORT's realization table picks a DOM event type, and the DOM decides what a click on content means. That is acceptable as *realization* only if MESH says which interactions a primitive's event means; it doesn't (E6).

## Why PORT can't decide this

- **It is application meaning, not realization.** Whether one gesture runs one command or two changes what the application *does*: which intents reach NEXUS, how many, and in what order (E3). PORT realizes meaning; it doesn't define it (CONTRACT.md; PORT rule 1).
- **It must hold across PORTs.** A MPRX template must mean the same on every target (PORT rule 2). If each PORT answered for itself, the Web PORT would answer "bubbling" (the DOM's default, E12) and a Canvas or native PORT whatever its hit-testing does, and one template would have different behavior per target.
- **The information that would decide it isn't PORT's.** Relating one component's event to another's needs knowledge of what components' events mean (E5, E6). That lives in the manifest and MPRX, which PORT never receives.
- **A template can't express either choice today.** MPRX has no way to stop or request propagation (§9.5: a handler is exactly one command invocation). So whichever answer MESH gives may also need language support, which only MESH can add.

## Recommendation

- **Best supported by current MESH evidence: B1, local binding with the nearest bound node.** Every relevant statement treats a binding as one node's (E1, E2, E4, E8); MESH has no cross-component event relation (E5, E9); MESH calls `on.click` intent, not a DOM event (E7); and MESH's own host dispatches once per event (E10). Nothing in MESH supports A: its only source is the DOM's default (E12).
- **Handed to MESH** as questions E-Q1 to E-Q4 in the [MESH semantic handoff](./2026-09-27-mesh-semantic-handoff.md#event-questions).
- **It is not settled.** No MESH document states multiplicity (Q1) or extent (Q2) (E6, E11), and no MESH test evaluates nested bindings (E10). **This is a MESH contract gap**, and PORT does not modify MESH to close it. What MESH would need to say:
  1. whether one user interaction triggers at most one binding (Q1);
  2. how an interaction on a descendant relates to an ancestor's binding: never (B2), only when no nearer node binds it (B1), or always (A);
  3. if not B2, what an event of a primitive covers (Q2), or that this is left to each PORT's realization of the primitive.
- **PORT's position until then:**
  - V0.3 (events) is **not semantically complete**. The roadmap says so.
  - The Web PORT keeps the DOM's behavior, pinned by *characterization* tests (`test/propagation.test.ts`) that say it's not the contract. `docs/CONTRACT.md` and the Web PORT's README state that propagation is unspecified and must not be relied on.
  - The Web PORT is **not** changed. Implementing B1 would make PORT the source of the semantic. Failing closed (refusing a tree where one interaction could trigger two bindings) was considered and **rejected by the project** (2026-09-27): it would refuse valid MESH programs, and it too would be PORT deciding a semantic question. So is any PORT-specific propagation abstraction built only to hide the question, and none is added.
  - The vertical slice is unaffected: no bound node in it has a bound ancestor.
