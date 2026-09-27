# Value realization audit

**Date:** 2026-09-27
**Question:** how does a render-v1 prop value reach a Web target (a DOM property, a DOM attribute, and server-rendered HTML) without PORT inventing a conversion MESH forbids?

**Evidence examined:** ValanceX/Mesh at `a03733e`: `docs/MPRX-SPEC.md` §9.4, §9.7.7, §9.7.8, §9.8.1–§9.8.5; `docs/manual/runtime.md` ("What renderers and hosts must do", "Number to text"); `docs/guides/rendering-mesh-output.md`; `schemas/render-v1.schema.json`; `crates/mesh-runtime/src/lib.rs`; `crates/mesh-runtime/tests/common/renderer.rs`; `packages/mesh-runtime/src/index.ts`. For the Web: the DOM Standard (attributes are strings), WebIDL (conversion of JavaScript values to IDL types) and the HTML Standard (boolean attributes, serialization). PORT `packages/port-web` at this commit.

**Conclusion, briefly:** a render-v1 value is final, and the renderer must realize it as given (V2). Only **strings** reach every Web slot unchanged. HTML **boolean attributes** can realize booleans by presence, with no text. Every other case where the target needs **text**, that is a number, a boolean as text, `null`, a list or a record in an attribute or in server HTML, has **no text MESH gives for a prop**, and producing one would be PORT formatting a value. These are **MESH contract gaps**, and they block SSR design. The Web PORT refuses them today and keeps doing so.

---

## The boundary

> **PORT may realize a value according to a MESH-defined representation, but PORT must not determine the semantic textual representation of a MESH value.**

Where MESH defines the representation (a string, a text run, a boolean realized by presence where the realization table chooses that), PORT realizes it. Where a target needs text and MESH defines none, PORT refuses. It adds no formatting, `JSON.stringify`, JavaScript coercion (`String(x)`, `"[object Object]"`, `"a,b"`) or any other fallback. The [MESH handoff](./2026-09-27-mesh-semantic-handoff.md) asks MESH the question that would close the gap.

## Facts

**V1. The values.** A render-v1 prop value is one of: `null`, a boolean, a finite number (never `-0`), a string, a list, or a record (`$defs/value`; §9.8.1). An absent prop has no entry. It is a separate case, not a value.

**V2. Realized as given.** Runtime manual: a renderer "draws each node's component with its props … **as given**. It computes nothing: it doesn't format numbers, supply a missing prop, or convert values. Values are final". The guide: "Don't format a number …; don't supply a default for a missing prop; don't convert or trim a value. If a value looks wrong, the fix is in the template or the host's values, never in the renderer."

**V3. MESH defines text, but only for content.** §9.7.7 gives the text of an *interpolation in content*: a string is itself, a boolean `true`/`false`, `null` is `null`, absent is empty, and a number by §9.7.7.1 (MESH's own shortest-nearest-even digits). §9.8.2's "Out" column says the same: props go out "as is", text runs as "text `null`", "text `true` or `false`", "text by §9.7.7.1". **No rule gives a prop's value a text form.**

**V4. Lists and records have no text form, deliberately.** §9.7.8: interpolating a list or record in content is a check-time error, `content-not-text`, because "no text form of one is obviously right".

**V5. A template can't make text from a number for a prop.** §9.4: "`+` is numeric only. There is no string concatenation: text content already interleaves text and expressions." There are no built-in members or functions. A prop gets a string only when the template or the host's values already hold one.

**V6. MESH's number text isn't available to a JavaScript renderer.** The Rust runtime exports `mesh_runtime::number_to_text`. `@valancex/mesh-runtime` exports only `render`, `dispatch`, `init` and `version`. The runtime manual: "It isn't a JavaScript engine's `String(x)`. ECMA-262 leaves the last digit open, so an engine may differ from MESH … A renderer … never formats a number itself." MESH's README: "MESH evaluates MPRX exactly once, in its runtime."

**V7. JSON is lossless, but not a display text, and not canonical.** §9.8.5: "Every output can be written as JSON without loss". It defines how JSON is *read* (nearest binary64) but not which digits are *written*. A JSON string is quoted (`"Ada"`), so JSON is a data encoding, not the text a user sees.

**V8. MESH's own reference renderers print props as JSON.** The guide's renderer writes ` ${name}=${JSON.stringify(value)}`. The Rust reference renderer (`tests/common/renderer.rs`) prints each prop's `serde_json::Value`. Both are debugging printouts (`first.html` is "the reference renderer's printing"), not a declared realization of props. Still, they are MESH formatting prop numbers, with a formatter MESH elsewhere says isn't authoritative (V6).

**V9. Web facts.**
- **Attributes are strings.** A DOM attribute's value is a string, and so is every attribute in HTML. `setAttribute(name, x)` converts a non-string `x` by WebIDL `DOMString` conversion, which is ECMAScript `ToString`: `String(1.5)`, `"null"`, `"a,b"` for a list, `"[object Object]"` for a record.
- **Boolean attributes** (HTML Standard): presence means true, absence means false. The value is irrelevant, and `"false"` means *true*.
- **Enumerated attributes** such as `aria-pressed` take keywords, for example the text `"true"`/`"false"`. That is a boolean as *text*.
- **DOM properties are typed** (WebIDL). A `double`/`long` property (`valueAsNumber`, `tabIndex`) takes a number natively; a `boolean` property (`disabled`, `checked`) a boolean; a `DOMString` property (`title`, `value`) converts anything else by `ToString`; nullable properties take `null`. A custom element's own JavaScript properties take any value, lists and records included, unchanged.
- **HTML serializes attributes and text only.** A property with no content attribute (`indeterminate`, a custom element's property, `value` after the user edits it) has no HTML form at all. Serializing a string is escaping, which is lossless and reversible, not a conversion of the value.

**V9a. render-v1 carries no declared type and no output slot.** A node holds a primitive's name; a prop holds a name and a value (`$defs/node`, `$defs/value`). The manifest declares prop types, but PORT never receives the manifest; which target slot a prop occupies is the PORT's realization table's choice. So nothing in render-v1 says what position a value was meant for, and a value's *kind* at run time is all PORT can see. Any interpretation needing a declared type or an output position needs a change to MESH's contract, originating in MESH, not in PORT.

**V10. What the Web PORT does today.** `attribute(name)` takes strings only; `booleanAttribute(name)` takes booleans only, by presence. Any other value is refused with `unrealizable-value`. There is no property realization. Those two realization kinds are data, so an SSR path could use the same table.

## Handoff matrix

For each value and output context: what MESH specifies, what it leaves unspecified, whether the Web PORT realizes it today, and whether SSR depends on the missing rule. *Content* means a text run: MPRX interpolation, which MESH turns into text before PORT sees it. *DOM property* and *attribute / SSR* concern a **prop** value, placed wherever a primitive's realization puts it.

| Value | Context | MESH specifies | MESH doesn't specify | PORT today | SSR depends on the gap |
|---|---|---|---|---|---|
| string | content | itself (§9.7.7) | — | yes: a text node | no: escaping only |
| string | DOM property | out "as is" (§9.8.2) | — | not built (no property realization kind) | no |
| string | attribute / SSR | out "as is" | — | yes: `attribute` | no: escaping only |
| number | content | text by §9.7.7.1, arrives as a string | — | yes | no |
| number | DOM property | out "as is" | whether a target's own conversion (a `DOMString` property's `ToString`) is realization or forbidden formatting | not built | only if the property reflects to an attribute (next row) |
| number | attribute / SSR | out "as is"; no text for props (V3) | **a prop's text** | **refused** (`unrealizable-value`) | **yes** |
| boolean | content | `true` / `false` | — | yes | no |
| boolean | DOM property | out "as is" | as for number, for a `DOMString` property | not built | only if reflected |
| boolean | attribute / SSR | out "as is" | **a prop's text** (enumerated attributes such as `aria-pressed`); whether realizing `false` and absent identically (presence) is acceptable for a given primitive | presence: yes (`booleanAttribute`); as text: **refused** | presence: no; as text: **yes** |
| null | content | `null` | — | yes | no |
| null | DOM property | out as `null`, distinct from absent | as for number | not built | only if reflected |
| null | attribute / SSR | out as `null`, distinct from absent | **text, omission (which equals absent), or unrealizable** | **refused** | **yes** |
| list | content | none: `content-not-text` at check time, or an evaluation error for `any` (§9.7.8) | — (deliberately no text form) | never reaches PORT as content | no |
| list | DOM property | out "as is" (no absent elements) | whether passing the structure to a property that accepts it is realization as given | not built | only if reflected |
| list | attribute / SSR | out "as is" | **any representation** in a text slot | **refused** | **yes** |
| record | content | as for list | — | never reaches PORT as content | no |
| record | DOM property | out "as is" | as for list | not built | only if reflected |
| record | attribute / SSR | out "as is" | **any representation** in a text slot | **refused** | **yes** |

**Absent** (no prop entry) is specified in every context: omission, never a default (V2, §9.8.2). PORT realizes it as omission.

## Web slot detail

For each render-v1 value kind, whether it can be realized in each Web slot **as given** (V2), without PORT producing text or converting the value.

| Value | DOM property | DOM attribute | SSR HTML |
|---|---|---|---|
| **string** | **As given** into a `DOMString` property. | **As given.** | **As given**, escaped. Escaping is serialization, not conversion. |
| **number** | **As given** into a numeric property (the browser holds the number). Into a `DOMString` property the *platform* formats it by `ToString`, which may differ from MESH's text in the last digit (V6): **gap**. | **Gap.** Needs text; MESH gives none for props (V3), and `ToString` isn't MESH's text (V6). | **Gap**, the same as the attribute. A numeric property with no content attribute has no HTML form at all; see "Not serializable" below. |
| **boolean** | **As given** into a `boolean` property. Into a `DOMString` property the platform makes `"true"`/`"false"`: **gap**. | Boolean attribute: **as given, by presence** (no text). Enumerated or text attribute (`aria-pressed="true"`): **gap**, since it needs text MESH gives only for content (V3). | Boolean attribute: **presence** (as the DOM). Text form: **gap**. |
| **null** | **As given** into a nullable property. Into a non-nullable `DOMString` property the platform makes `"null"` or `""`: **gap**. | **Gap.** Omitting the attribute would make `null` equal to *absent*, which MESH keeps distinct (§9.8.2). Writing `"null"` borrows content text (V3). | **Gap**, the same as the attribute. |
| **list** | **As given** only into a property that accepts a JavaScript value unchanged (a custom element's property). Otherwise the platform converts it: **gap**. | **Gap.** No text form exists by MESH's own decision (V4); `ToString` gives `"a,b"`. | **Gap.** |
| **record** | As for a list. | **Gap** (V4); `ToString` gives `"[object Object]"`. | **Gap.** |

**Absent** (no prop): omitted in every slot. It is realized as omission, never as a default (V2).

**Not serializable, whatever the value:** a value realized as a DOM property with no content attribute has no HTML form. SSR can't show it, and hydration must apply it on the client from the tree. Nothing new is needed for that: the tree has the value.

**One subtlety in "as given, by presence":** a boolean attribute realizes `false` and absent the same way (no attribute). That is correct only if the primitive means the same thing by both, and a manifest can't say whether it does. It is the realization table's explicit choice, per primitive. The PORT doesn't do it generically.

## Contradictions

- **VC1. The guide assumes numbers arrive as text.** "Don't format a number (MESH already turned it into text, by its own rule…)" holds for text runs only. A number *prop* arrives as a number (V1, V3), and a text-only slot then has nothing to draw.
- **VC2. MESH's reference renderers format prop values** (V8), with formatters MESH says aren't authoritative (V6), while MESH forbids renderers to format. Harmless for a debugging printout. It shows the question hasn't been faced for a real text target.

Neither contradicts the PORT contract. PORT follows V2 strictly, and render-v1 and the contract agree (no stop condition 3).

## Upstream questions for MESH

The fundamental question, with its consequences for each interpretation, is in the [MESH handoff](./2026-09-27-mesh-semantic-handoff.md): **does render-v1 carry semantic values that PORT must realize, or values already semantically realized for the relevant output position?** The narrower questions it contains:

1. **Scalar props in text slots.** When a target needs text for a number, boolean or `null` prop, what is it, and who produces it?
2. **`null` in text slots.** Is it text (content uses `null`), omission (which makes it equal to absent), or unrealizable?
3. **Lists and records.** MESH says no text form is obviously right (V4). Is placing one in a text slot ever valid, in any representation, and is a structural lowering chosen per primitive (a list of strings as `class` tokens) realization, or text PORT would be inventing?
4. **Platform conversions.** When a target's own API converts a value (a `DOMString` property given a number), is that realizing the value as given, or formatting MESH forbids? Its text may differ from MESH's in the last digit (V6).

Earlier drafts of this audit listed possible directions: MESH's text rules applied to props with the formatter exported to JavaScript, a render-tree version carrying text, or text-facing props declared as strings. **PORT selects none of them.** They are MESH's architectural decisions, and appear in the handoff only as the consequences of each interpretation.

## PORT's position

- The Web PORT **does not** add number, boolean-as-text, `null`, list or record formatting. It keeps refusing them with `unrealizable-value` (`packages/port-web/test/port.test.ts` pins every refused cell for the two realization kinds it has).
- **SSR design is paused** until question 1 at least is answered: server HTML is attributes and text, so every non-string value in an attribute needs an answer. No second representation such as "render-v1 → Web HTML values" is built in the meantime.
- **Adding DOM property realization** would be safe only for the cells marked *as given* above. It is not added now, because nothing requires it, and each property realization would also have to state that it isn't serializable.
