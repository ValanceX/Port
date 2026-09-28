# PORT Web SSR: server HTML and hydration

**Date:** 2026-09-28
**Status:** Approved (`edea539`), with the table-validation tightening in §4.7 and the adoption-failure decision in §7.1. The first milestone (§10) is implemented: `packages/port-web/src/{check,html,server,port}.ts`, tested as §12 describes.
**Scope:** the Web PORT (`@valancex/port-web`) only. This is not a universal PORT contract, and it adds no shared renderer API.
**Baseline:** PORT branch `claude/port-mesh-v0.6-adoption-ius9fs` (Gate A), MESH v0.6.0 (`a8a046f`), `@valancex/mesh-runtime` 0.6.0, `@valancex/nexus` 0.8.0.
**Inputs:** [PORT contract](../../CONTRACT.md), [Web value realization](../../architecture/2026-09-28-web-value-realization.md), MESH spec §9.7.7, §9.8.7, §9.9, and MESH's runtime manual (keys, program identity, handler identifiers, determinism).

---

## 0. Summary

```text
server:   render-v1 ──▶ check ──▶ realize.ts ──▶ HTML writer ──▶ HTML (a string)
browser:  HTML ──▶ parsed DOM ──▶ hydrate(tree): verify all, then adopt ──▶ the same drawn state draw(tree) builds
                                               └─ any mismatch ──▶ draw(tree), reported
          ──▶ update(tree) … as today
```

- **One semantic pipeline.** Server and browser run the same tree check and the same `realizeProp` (`realize.ts`). The server only *places* the outputs it gets, as HTML. There is no second value system: `propText` still comes from MESH, and nothing calls `String()`, `JSON.stringify()` or relies on DOM or HTML coercion.
- **What the server can write** is exactly what HTML can hold and a parser gives back unchanged: text-only attributes, boolean attributes and text runs. A present value in a **DOM property slot has no HTML form, and SSR v1 refuses the tree.** PORT never derives an attribute from a property, even where the browser reflects one.
- **Hydration identity is structural, and needs no new metadata.** Within one MESH program a tree's shape, components and keys don't depend on values. So the client renders the same state, gets the tree, and pairs it with the server DOM by position. It then verifies **every** realized element, attribute and text against the tree before touching anything. render-v1 is not changed, and the HTML carries no keys, handler identifiers, program identity or hydration IDs.
- **Continuity:** `draw` and `update` keep their meanings. `hydrate` is a third entry into the drawn state. When it succeeds, PORT is exactly as if `draw(tree)` had run, except that the server's DOM nodes are kept, so the next render is an `update`. On a mismatch, PORT runs `draw(tree)` itself and reports why. The composer still owns program continuity and the drawn `Render`.
- **Mismatch policy:** no patching and no partial recovery. Any mismatch falls back, deterministically, to a fresh draw of the whole tree. A tree PORT can't realize at all is refused, as `draw` would refuse it.
- **Atomicity, precisely:** A tree is fully verified before adoption begins; structural verification is mutation-free. Adoption is not transactionally rollbackable across arbitrary DOM property setters. Hydration verification is mutation-free and atomic. Adoption occurs only after successful verification, but adoption itself is not rollbackable across arbitrary DOM property setters. A setter failure is reported as an adoption failure; PORT does not promise transactional rollback of external DOM side effects. A structural mismatch cannot cause partial adoption, because all verification completes before adoption begins. (§7.1)

---

## 1. The invariant: one realization pipeline

```text
render-v1 tree ──▶ check(tree, primitives)           shared: format, keys, realizations, void children
               ──▶ realizeProp(node, name, slot)     shared: absent | text (value or propText) | native
               ──▶ writer                            DOM writer (draw/update/hydrate), or HTML writer (server)
```

- **`realize.ts` stays the one decision point** for what a prop value becomes: absent, a text (a string's own value, or MESH's `propText`), or a native value. The HTML writer consumes the same `Output`s the DOM writer does. It never looks at a prop value to produce text.
- **The tree check becomes one DOM-free module** (`check.ts`, extracted from `port.ts`), used by `draw`, `update`, `hydrate` and the server. A tree is refused, or accepted, for the same reasons everywhere. The server then adds only **serialization refusals** (§4.8): cases where HTML can't carry something the DOM can.
- **Unsupported is an explicit failure** on both sides. The server has no fallback text, placeholder value, omitted prop or best-effort markup.

What the HTML writer adds is **escaping** (§4.3), which is lossless and reversible for every string it accepts. It is serialization, not conversion of a value.

## 2. The two judgement calls, settled

### 2A. Absent DOM properties: a PORT realization rule

The chain has three links, and they are **not interchangeable**:

```text
MESH semantic prop ──(realization table)──▶ DOM property ──(platform behavior, per property)──▶ HTML attribute
```

The first arrow is PORT's (the table picks the slot). The second is the platform's: reflection, default-value attributes, dirty flags. It differs per element and property, and often isn't equivalence. Confirmed against the DOM:

- `input.value` reflects nothing. The `value` attribute is `defaultValue`, and writing the property doesn't change the attribute.
- `input.checked` doesn't reflect. The `checked` attribute is `defaultChecked`.
- `progress.value` *does* reflect, but by the platform's own `ToString`, which isn't MESH's text (MESH runtime manual, "Number to text").

**Rule (PORT realization; client and server):**

1. **An absent prop means PORT writes nothing to the slot.** MESH supplied no default, and PORT invents none.
2. **The element's initial value** of a property slot is defined as that property's value on a freshly created element of the primitive's tag, with no attributes (`doc.createElement(tag)[name]`). This is what the client already captures today, since it reads the slot before any write. It is a property of the target, not a MESH value.
3. **PORT only withdraws its own writes.** When a prop PORT realized becomes absent in an `update`, PORT restores the initial value (rule 2). That undoes PORT's own write and restores the platform's state; it doesn't supply a value.
4. **On an adopted (hydrated) element,** an absent property slot is not written at all: PORT never wrote it, so there is nothing to withdraw. Whatever the element holds there (for example, what the user typed before hydration) is therefore left untouched. That is a consequence of not writing, not a guarantee to preserve input: pre-hydration input is not preserved in general (§9). The initial value for later withdrawals is taken from a probe element per rule 2, never from the adopted element, whose state the server's attributes or the user may have changed.
5. **Server:** an absent property slot has no output. Omission on both sides is exact.
6. **Server:** a present value in a `property` or `textProperty` slot has **no HTML representation** and is refused (`unserializable-prop`). A reflected attribute is not a representation: PORT would be encoding one platform's per-property behavior as if it were MESH semantics. An application that wants a prop in server HTML realizes it as `attribute(...)` or `booleanAttribute(...)`, explicitly, and then the client uses that same attribute.

So SSR v1 never has to "establish the client-side property later" for a value the server displayed. Present property values never reach server HTML. Hydration applies whatever property values the *client's* tree has (§5.5), exactly as `draw` would.

### 2B. What one interaction is

**Rule (the Web PORT's mapping, MESH §9.9.1):** one interaction is **one DOM event delivered to the PORT's event realization layer** (the container's capture listener). For each primitive, a DOM event type constitutes at most one of its events (enforced: `invalid-primitives`). MESH's resolution then selects at most one binding (§9.9.2).

**Consequence, documented and accepted:** one physical gesture can be several DOM events (`pointerdown`, `mousedown`, `pointerup`, `click`). If a realization table maps events to more than one of them, one gesture is several interactions, each resolved separately, and can give several reports and several intents. Example: `button.press` → `pointerdown` and `card.click` → `click`. That comes from the table author's mapping, and it's visible in the table. It isn't PORT merging or splitting interactions. **No gesture deduplication is added.** MESH asks for none, and deduplication would need a notion of "gesture" that MESH doesn't have, and a time window, which would be a second event model. A table that wants one intent per gesture maps every primitive's gesture-level event to the same DOM event type.

SSR and hydration change nothing here. The server serializes no event information, and hydration installs the same capture listeners `draw` does (§9).

## 3. The SSR boundary: every realization category

"Semantically equivalent" means: parsing the server HTML gives a DOM in which this slot holds exactly what `draw` would have put there.

| Realization | Client DOM | Server HTML (SSR v1) | HTML representation? | Equivalent? | Only browser reflection? | SSR omits it? | Hydration establishes it? |
|---|---|---|---|---|---|---|---|
| native DOM property, `property(name, holds)`: present | supported | **refused**, `unserializable-prop` | none | — | a reflected attribute, where one exists, is platform behavior and not MESH text (`progress.value`), or holds something else (`checked` → `defaultChecked`) | no: refuses | n/a (refused on the server). Applies the client tree's value when *that* tree has it present (§5.5) |
| native DOM property: absent | supported (omission) | **supported**: no output | nothing to represent | yes: omission ⇔ omission | — | yes, exactly | no write (§2A.4) |
| native DOM attribute | = `booleanAttribute`, the only native attribute kind | see next row | | | | | |
| boolean attribute, `booleanAttribute(name)` | supported | **supported**: `name` present for `true`; nothing for `false` or absent | yes: presence | yes: the parser gives the attribute, value `""`, as `setAttribute(name, "")` does | no: it is the slot itself | only for `false` or absent, as the client does | verified, not written |
| text-only attribute, `attribute(name)` | supported | **supported**: `name="…"`, the string's own value or `propText`, escaped (§4.3) | yes | yes: the parser gives back the exact text | no | only when absent, as the client does | verified, not written |
| text property, `textProperty(name)`: present | supported | **refused**, `unserializable-prop` | none. `value` → `defaultValue`, and `title` reflects to `title`, but reflection is per-property platform behavior (§2A) | — | yes, where it exists at all | no: refuses | n/a on the server; applies the client tree's value if present (§5.5) |
| text property: absent | supported (omission) | **supported**: no output | nothing to represent | yes | — | yes, exactly | no write |
| non-empty text run | supported | **supported**: the text, escaped (§4.3). **Refused if it contains U+0000** (`unserializable-text`) | yes | yes, with CR written as `&#13;` (§4.3) | no | no | verified, not written |
| empty text run | supported (an empty `Text` node) | **supported**: no output | **none**: HTML can't express an empty text node | its *display* is equivalent (nothing). Its node is re-created at hydration, at the position the tree gives | no | yes: nothing to write | **yes**: hydration inserts an empty `Text` node at its tree position (§5.4) |
| list/record in a text slot | refused (`unrealizable-value`) | refused (same check) | none (MESH §9.7.8) | — | — | — | — |
| unsupported realization (no slot, no event realization, children under a void element) | refused | refused (same check) | — | — | — | — | — |
| event bindings | listeners on the container, handler identifiers read at resolution | **no output** | none, and none is needed | the bindings come from the client's tree (§5.3) | — | yes | yes: capture listeners, installed at the end of hydration |
| unknown component | `<valance-unknown data-component="…">`, children realized | **supported**: the same element and attribute, children serialized | yes | yes | no | its props and events aren't realized on either side | verified like a primitive |

The empty text run is the only content with no HTML form that SSR v1 accepts. It's not a silent drop: its content is the empty string, which displays as nothing on both sides. Its identity (a node at a position) is fully determined by the tree, and hydration restores it exactly (§5.4). A present property value is different. It has a visible effect (a progress bar's position, an input's value) that server HTML wouldn't show, so accepting it would silently drop semantic content from the server's output.

## 4. HTML serialization

### 4.1 Result and API boundary

```ts
// @valancex/port-web/server: DOM-free; no document, window or DOM type at run time.
export const realizeHtml: (tree: RenderTree, primitives: WebPrimitives) => string;
```

- It returns **the container's content as an HTML string**, and throws a `WebRealizationError` (with its existing `code` and `key`) on refusal. A refusal produces no partial output.
- **Why only HTML:**
  - Everything else hydration needs (keys, handler identifiers, which slots are properties, where empty text runs are) is determined by the tree, which the client gets by rendering the same state (§5).
  - Shipping it again as metadata would make a second source of truth that can disagree with the tree. It would also put keys and handler identifiers into markup. MESH calls those opaque, not secret, and nothing needs them there.
  - SSR v1 has no warnings (no "accepted but degraded" case exists), so it returns no diagnostics channel beside the error.
  - A structured result can be added when a real consumer needs one (for example, deferred property slots, §11). The string then becomes one field of it.
- **Why a separate entry point in the same package:** the server path must not load DOM code, and both paths must share `primitives.ts`, `check.ts`, `realize.ts` and `error.ts`. `@valancex/port-web/server` is a subpath export of the Web PORT, not a new package and not a shared renderer API. There is still no `@valancex/port`.

### 4.2 Elements

- **Tag:** the primitive's `element`, which must be a valid lowercase name, `[a-z][a-z0-9-]*` (checked when the table is validated, §4.7). The client's `createElement` lowercases in an HTML document, and the parser lowercases too, so only lowercase names round-trip.
- **Supported element kinds (v1):**
  - **normal elements;**
  - **void elements** (§4.6), which must have no children, as the client already enforces.
- **Refused element kinds** (`unserializable-element`), whatever their content:
  - raw text elements: `script`, `style`;
  - escapable raw text elements: `textarea`, `title`;
  - `template`, and the parser-special elements `xmp`, `iframe`, `noembed`, `noframes`, `noscript` and `plaintext`;
  - foreign elements `svg` and `math`. The parser puts these in another namespace than the client's `createElement` does.
  
  Their children don't parse as the tree says.
- **Unknown component:** `<valance-unknown data-component="NAME">`, with children, exactly as the client draws it. `NAME` is escaped as an attribute value.

### 4.3 Escaping

The goal is that parsing gives back **exactly** the string that was written. The HTML standard's serialization algorithm alone doesn't do that. The following was checked against a spec-conformant parser.

| Character | In text | In a double-quoted attribute value | Why |
|---|---|---|---|
| `&` | `&amp;` | `&amp;` | otherwise it can start a character reference |
| `<` | `&lt;` | `&lt;` | otherwise it can start a tag (it is escaped in attributes too, for safety) |
| `>` | `&gt;` | `&gt;` | conventional; harmless |
| `"` | literal | `&quot;` | it would end the value |
| U+000D CR | `&#13;` | `&#13;` | the parser's input preprocessing turns a literal CR, or CRLF, into LF. A reference to U+000D is kept |
| U+0000 | **refused**, `unserializable-text` | **refused**, `unserializable-text` | HTML can't hold it: a literal NUL is dropped in text and becomes U+FFFD in attributes, and `&#0;` becomes U+FFFD |
| U+0080–U+009F | **literal** | **literal** | a numeric reference to these is remapped to Windows-1252 characters (`&#x85;` → `…`). The literal character is kept |
| every other scalar value | literal | literal | kept by the parser |

- Attribute values are always double-quoted.
- The output's character encoding is UTF-8. The page that embeds it must declare UTF-8. That is page assembly, not PORT's.

### 4.4 Attributes

- **Order:** ascending code-point order of attribute name. It is deterministic and independent of the table's or the tree's key order. Hydration compares attributes as a set (§5.2), so the order carries no meaning.
- **Text-only attribute** (`attribute(name)`): `name="ESCAPED"`, where the text is `realizeProp`'s `text` output: a string's own value, or MESH's `propText`. Absent writes nothing.
- **Boolean attribute** (`booleanAttribute(name)`): `name`, with no value, for native `true`. `false` and absent write nothing. The parser gives value `""`, which is what the client's `setAttribute(name, "")` gives.
- **Names:** the realization table's names must match `[a-z_:][a-z0-9_.:-]*` (§4.7). That is a subset that `setAttribute` and the tokenizer both accept, and lowercase because both lowercase HTML attribute names.
- **No duplicates:** a primitive may not map two props to one attribute name, and `data-component` is reserved for the placeholder (§4.7). HTML keeps the *first* of two duplicate attributes, while the DOM keeps the *last* write, so a duplicate would make server and client differ.

### 4.5 Text and children

- Children are serialized in tree order, recursively.
- A non-empty text run is its text, escaped (§4.3).
- An empty text run writes nothing (§3). Two text runs are never siblings: a run is a *maximal* sequence of adjacent text (MESH runtime manual), and a composite expands to one root element. So no merge by the parser can join two runs. The shared check treats two adjacent text runs as a malformed tree (`unsupported-tree`), on both sides.
- **`pre` and `listing`:** the parser drops one LF right after the start tag. If such an element's first child is a text run starting with LF, the writer emits one extra LF after the start tag.

### 4.6 Void elements

`area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track` and `wbr` are written as a start tag only (`<img …>`). A node realized as one with any child, even an empty text run, is already refused by the shared check (`unrealizable-children`).

### 4.7 Table validation (shared)

`createWebPort` and `realizeHtml` validate the realization table the same way, and refuse an invalid one with `invalid-primitives`:

- the existing rule: one DOM event type constitutes at most one event of a primitive;
- an element name matching `[a-z][a-z0-9-]*`;
- attribute names matching `[a-z_:][a-z0-9_.:-]*`; property names are free (they are JavaScript property names);
- within one primitive, no two attribute-class realizations (`attribute`, `booleanAttribute`) name the same attribute, and none names `data-component`;
- within one primitive, no two property-class realizations (`property`, `textProperty`) name the same property;
- **a source prop has at most one realization within a primitive**, across all four kinds (`property`, `textProperty`, `attribute`, `booleanAttribute`). One MESH prop must never have two competing realization classes: destination-name uniqueness alone doesn't exclude that. The table is keyed by source prop. **The type system prevents duplicate source-prop keys in ordinary object literals** (TS1117, pinned by a test). **Runtime validation protects against malformed programmatically-created tables and unstable getter entries:** it refuses an entry that isn't an own data property (an accessor could return a different realization on each read), and an entry that isn't a realization of a known kind (`property` also with a known `holds`). PORT supports no declaration of duplicate mappings; there is no table shape that expresses one.

That this tightens the client is intended. Today a bad tag name fails at `draw` with a DOM exception, and two props mapped to one attribute realize in an order-dependent way.

### 4.8 Refusals

| Code | Side | When |
|---|---|---|
| `unsupported-tree`, `duplicate-key`, `unrealized-prop`, `unrealized-event`, `unrealizable-value`, `missing-prop-text`, `unrealizable-children` | both (shared check) | as today; plus adjacent text runs → `unsupported-tree` |
| `invalid-primitives` | both | §4.7 |
| `unserializable-prop` | server | a present value in a `property` or `textProperty` slot (§2A) |
| `unserializable-text` | server | U+0000 in a text run or an attribute text |
| `unserializable-element` | server | an element kind HTML parsing doesn't give back as the tree says (§4.2) |

Every refusal is thrown before any output. Nothing is silently dropped: the only content with no HTML output is absent props (omission on both sides), empty text runs (re-created at hydration) and event bindings (installed at hydration from the client's tree).

**Known limit, caught at hydration rather than on the server:** the parser also restructures some nestings of normal elements. `<button>` inside `<button>` and `<div>` inside `<p>` close the outer element early, and table elements get implied `tbody`s or foster-parented content. The serializer doesn't model the parser's tree construction. These cases produce an element or child-count mismatch at hydration, which falls back to a fresh draw (§7), so the page is still correct and only the SSR benefit is lost. A test helper that parses server HTML back and compares (§12) finds them during development.

## 5. Hydration identity

### 5.1 What the existing contracts already give

- **The tree is determined by program and state.** The runtime "has no I/O, no clock, no randomness and no global state: identical inputs give identical results" (runtime manual).
- **Shape doesn't depend on values.** MPRX has no loops or conditional elements, and a text run is present even when empty. So every render of one program has the same nodes and text runs, with the same components, at the same positions. Only prop values, `propText` and text differ.
- **Keys are position.** A key is derived only from the program identity and the path of child positions and components from the root. It is "independent of values" and "stable within one program".
- **Keys are local to one program.** They are not stable across programs, and a tree doesn't say which program it came from.
- **Handler identifiers** are determined by program identity, key and event name. They are opaque, and dispatch validates them against the render it's given.

### 5.2 The conclusion: position plus complete verification, no new metadata

| Candidate | Needed? | Why |
|---|---|---|
| **tree position** | **yes, it is the pairing** | within one program, position is key (5.1). The client pairs the tree with the server DOM in document order: each node with the element at its position, and each non-empty text run with the `Text` node at its position |
| **element type** | verified | the element's `localName` and namespace (HTML) must be exactly what the tree's primitive, or the unknown-component placeholder, realizes as |
| **keys in the HTML** | **no** | keys aren't recovered from the HTML; they are *assigned* from the client's tree at adoption. A server rendered from another program with coincidentally identical realized content leaves the DOM showing exactly the client tree, which is correct, and from then on every key is the client program's |
| **component boundaries** | no | composites don't appear in render-v1. Their expansion is already part of every key and of the shape |
| **text nodes** | verified | each non-empty run's `Text` data must equal the run exactly. Empty runs have no server node and are inserted (5.4) |
| **primitive identity** | verified, as the element plus its attribute set | two primitives realized as the same tag and the same attributes are indistinguishable in HTML. Distinguishing them is unnecessary, because the DOM is then exactly what `draw` would build for the client's tree |
| **program identity** | **no** | hydration doesn't need to know which program the server rendered. It needs to know that the DOM displays exactly the client tree, and complete verification establishes that. Program continuity after hydration is the composer's, as always (§8) |
| **handler bindings** | **no** | HTML can't carry them and doesn't need to. They come from the client's tree, whose `Render` the composer retains (§6) |
| **render identity** | **no** | the render on screen after hydration is by definition the client's `Render`: its tree is what the DOM now realizes, verified, with its bindings installed |

**Complete verification** means, for every node and non-empty text run, before any DOM is changed:

- the element at the node's position has the expected `localName` and HTML namespace;
- the element's attribute set equals, **exactly**, the set the client would write:
  - each `attribute` realization with a text output, name and value;
  - each `booleanAttribute` with native `true`, name and value `""`;
  - `data-component` for the placeholder;
  - and no other attribute;
- the element's child list equals the expected list: the node's children in order, with empty text runs left out;
- a non-empty text run's node is a `Text` node with exactly the run's data;
- the container's child list is exactly `[the root's element]`, with no whitespace, comments or other nodes around it.

If that holds, then after adoption (5.4 and 5.5) the DOM is **node for node what `draw(tree)` would have built**, except that the nodes are the server's. That is the whole identity argument. It needs nothing render-v1 doesn't already carry, so **render-v1 is not changed and no metadata is added.**

### 5.3 What hydration cannot see, and why that is safe

Verification covers everything HTML represents. It can't see event bindings, or property slots.

- **Bindings** after hydration are the client tree's, and the client's `Render` is retained for dispatch (§6). So every report is dispatched with a render whose tree the DOM realizes. That is the contract's requirement, and it holds whatever the server's bindings were.
- **Property slots** can't differ as displayed server state, because SSR v1 refuses present property values on the server (§2A.6). The client tree's present property values are applied at adoption (5.5).

### 5.4 Empty text runs

For each empty text run, adoption creates an empty `Text` node from the container's document, and inserts it at the run's position among its parent's adopted children. Its position is fully determined: two runs are never siblings (§4.5), so its neighbours are elements, or nothing. This is a deterministic step of adoption, not a mismatch repair.

### 5.5 Adoption (after verification succeeds)

Adoption, in one synchronous step, and only after verification of the whole tree has succeeded:

1. build exactly the drawn-node records `draw` builds (`key`, `component`, `primitive`, `parent`, `outputs`, `handlers`), with `dom` set to the adopted element or text node;
2. insert the empty `Text` nodes (5.4);
3. for property-class slots with a present output, write the value (native, or text for `textProperty`), exactly as `create` does;
4. leave absent property slots unwritten, and record initial values from a probe element per tag (§2A.4);
5. once every node is adopted, register every adopted element in the resolver's node map;
6. install the container's capture listeners.

**No attribute or text is written:** verification has proved they already equal what would be written. Steps 2 and 3 are the only DOM writes adoption makes. Step 3 calls DOM property setters, which are outside PORT; if one throws, see §7.1.

## 6. Hydration and NEXUS render snapshots

The client contract, unchanged: **a DOM interaction is dispatched with the render that was on screen when the interaction occurred.**

```text
server composer                                   client composer
  state S (NEXUS)                                   state S (NEXUS, initialized from the page)
  host(program P).render ─▶ Render R_s              host(program P).render ─▶ Render R_c   (R_c.tree = R_s.tree by determinism)
  realizeHtml(R_s.tree) ─▶ HTML ─▶ page ───────────▶ port.hydrate(R_c.tree)
  (R_s is discarded)                                 shown = { host, render: R_c }, in the same synchronous task
                                                     follow host.renders ─▶ port.update(tree); shown.render = later
```

1. **The snapshot the hydrated DOM represents** is the client's `R_c`. That is the render of the state the client's NEXUS application holds when the composer hydrates, and verification proves the DOM displays exactly its tree. The server's `R_s` never crosses. Its only trace is the HTML, which is checked against `R_c.tree`.
2. **How it is retained:** as today. The composer keeps `{ host, render: R_c }` as the drawn render, set in the same synchronous task as `hydrate`, so no interaction can be reported before it's set. Later renders replace it on each `update`.
3. **How event resolution uses it:** PORT resolves an interaction against its drawn tree (`R_c.tree` after hydration), and reports the handler identifier. The composer dispatches it with `R_c` (or its successor, after an update). This is identical to `draw`.
4. **An update from NEXUS before hydration completes:**
   - `hydrate` is synchronous, so nothing can interleave inside it.
   - If client state changed before the composer took `R_c`, `R_c` reflects the newer state. If the change is visible, verification fails and PORT draws `R_c.tree` afresh (§7). If it isn't visible (only a present property value), adoption applies it.
   - Renders produced after `R_c` arrive on `host.renders`, and are `update`s, exactly as after `draw`.
   - Either way, what is on screen is always the retained render's tree.
5. **When server HTML and the expected render differ:** that is a mismatch (§7). PORT draws the client's tree afresh, so the screen again shows `R_c.tree`, and dispatch uses `R_c`.

**No second NEXUS state model.** State reaches the client the way any application initializes NEXUS state (`createState(running, Schema, initial)`), from a value the page embeds. The page embeds it, and the application serializes it with its own schema. Neither is PORT's or NEXUS's concern. NEXUS knows nothing about HTML, SSR or hydration (roadmap V0.7, "Important boundary"). PORT never sees the state.

## 7. Mismatch policy

Hydration runs in two phases: **verify everything, then adopt.** Verification makes no DOM change. The first mismatch in document order (a pre-order walk of the tree) decides the outcome, and it is reported as `{ class, key?, expected, found }`.

| Class | Detected as | PORT does |
|---|---|---|
| **unsupported realization** | the shared check refuses the tree | **refuses**: throws `WebRealizationError`, and the container is untouched. `draw` would refuse the same tree, so there is nothing to fall back to |
| **container mismatch** | the container's children aren't exactly one element | **fresh draw** |
| **element mismatch** | wrong `localName` or namespace at a node's position (including parser restructuring, §4.8) | **fresh draw** |
| **primitive/component mismatch** | a placeholder's `data-component` differs; or the element is right but its attribute set is another primitive's | **fresh draw** (it appears as element or attribute mismatch) |
| **child-count mismatch** | an element has more or fewer children than expected | **fresh draw** |
| **text mismatch** | a `Text` node's data differs, or a non-text node is where text is expected | **fresh draw** |
| **attribute mismatch** | an expected text attribute missing or different, or an unexpected attribute present | **fresh draw** |
| **boolean attribute mismatch** | presence differs, or its value isn't `""` | **fresh draw** |
| **keyed identity mismatch** | not separately detectable: keys aren't in HTML, and a structure that differs from the tree's appears as element or child-count mismatch | **fresh draw**, via those classes |
| **stale server render** (server state ≠ client state, or another program) | visible differences appear as text or attribute mismatch. Two differences are invisible in HTML: a present property value in the client tree, and, only across programs (handler identifiers don't depend on values), different bindings behind identical content | **fresh draw** when visible. When invisible, **adopt**, which is correct because property values are applied from, and bindings read from, the client tree, whose `R_c` the composer retains |

- **Fresh draw** means PORT, inside `hydrate`, runs exactly `draw(tree)`: new nodes, the container's content replaced, and the state and listeners of a draw. `hydrate` returns `{ adopted: false, mismatch }`.
- On success it returns `{ adopted: true }`.
- **No patch or partial adoption in v1.** A patch would need a second reconciliation model between two sources, HTML and tree. Keyed reconciliation (`update`) is only defined within one PORT-drawn program.
- The policy is deterministic: the same HTML and the same tree always give the same outcome and the same reported mismatch.
- The composer surfaces a mismatch (logging, telemetry); PORT never hides it.

### 7.1 Adoption failure: not a mismatch

> Hydration verification is mutation-free and atomic. Adoption occurs only after successful verification, but adoption itself is not rollbackable across arbitrary DOM property setters. A setter failure is reported as an adoption failure; PORT does not promise transactional rollback of external DOM side effects.
>
> A structural mismatch cannot cause partial adoption, because all verification completes before adoption begins.

A DOM property setter is external behavior. It may throw, mutate other state, run custom-element code, or have effects PORT can't observe or reverse. So PORT doesn't wrap adoption in a transaction it can't honour. The decision:

- **Verification** is fully atomic. It performs no DOM mutation, and no server DOM is adopted until it has succeeded for the whole tree.
- **Adoption** performs only the documented writes (§5.5, steps 2 and 3).
- **If a property setter throws during adoption,** `hydrate` throws a `WebRealizationError` with code `adoption-failed`, the node's `key`, and the setter's error as `cause`. It is a realization failure, like a refusal, and not a mismatch: `hydrate` returns neither `{ adopted: true }` nor a mismatch.
- **No rollback is claimed, and none is attempted.** Writes adoption made before the failure (empty text nodes inserted, property values assigned, in document order) stay, together with whatever the setter itself did. Adoption stops at the failing setter; nothing after it is written.
- **No retry and no fallback draw.** The DOM may already be partly mutated, so a fresh draw would not be the clean fallback a mismatch gets, and retrying adoption would not be the same operation. The composer decides what to do.
- **PORT's own state is clean.** Nothing is drawn (`update` refuses with `not-drawn`), no listeners are installed, and nothing is reported. Adopted nodes are registered for event resolution only after the whole adoption has succeeded.

The same misconfiguration (a table realizing a prop as a DOM property whose setter throws) also makes `draw` throw, before its detached nodes reach the container, and makes `update`, which writes in place, throw mid-way. Neither is rolled back either. v0.2 changes neither.

## 8. Draw, update and hydrate

The meanings don't change:

- **`draw(tree)`**: the tree's program isn't currently represented by PORT's realization. Realize it afresh.
- **`update(tree)`**: the composer asserts the tree is the same program as the drawn one. Reconcile by key.
- **`hydrate(tree)`** (new): the composer asserts that the container holds server HTML realized from this tree's program and state, and that PORT has drawn nothing. PORT verifies and adopts, or else draws. Its precondition is that nothing is drawn; otherwise it refuses with a new code, `already-drawn`.
- **Postcondition, when adopted or after a mismatch:** PORT is in exactly the drawn state `draw(tree)` produces, with the tree drawn and listeners installed. After a refusal or an adoption failure (§7.1), nothing is drawn.

So:

```text
server HTML ─▶ hydrate(T) adopted      ─▶ update(T2) ─▶ update(T3) …   continuity established: T's program is drawn
server HTML ─▶ hydrate(T) mismatch→draw ─▶ update(T2) ─▶ …              the same continuity, from a fresh draw
server HTML ─▶ hydrate(T) refused (unrealizable tree): nothing drawn, the DOM untouched; the composer handles it as a failed draw
server HTML ─▶ hydrate(T) adoption-failed (a setter threw, §7.1): nothing drawn, the DOM possibly partly adopted; the composer decides
```

- Hydration establishes the **same continuity** a draw does. `update` is valid after it because the drawn records are exactly a draw's.
- PORT still infers nothing from the tree or the HTML about programs.
- The composer still decides: it calls `hydrate` only for the program it knows the server rendered, and `draw` for any other.
- Showing a different host later is a `draw`, as today.
- **Contract amendment, at implementation:** `docs/CONTRACT.md` gains `hydrate` as a Web-PORT operation, described in these terms. It is a Web-specific operation, not a new universal one: a PORT without server rendering doesn't have it.

## 9. Events around hydration

There is one event model: MESH §9.9 through the Web PORT's mapping (§2B).

- **Before hydration:** PORT has no listeners, and reports nothing. The browser's default actions (following a link, submitting a form, toggling a checkbox) are the platform's and happen or not as the markup says. Interactions are **not replayed**.
- **During hydration:** hydration is one synchronous task, so no DOM event is dispatched while it runs.
- **Immediately after:** the capture listeners are installed as the last adoption step. The composer sets its drawn render in the same task. So the first reported interaction resolves against the hydrated tree, and is dispatched with `R_c`.
- **After a mismatch:** the fallback is a draw, which installs the same listeners. From then on, everything is as after `draw`.
- **After a refusal:** nothing is drawn, no listeners exist and nothing is reported. The server HTML stays inert. The composer decides what to show.

**Event replay** (capturing interactions before hydration and resolving them afterwards) is **future work**. It isn't needed for the first milestone, whose claim is only that hydrated DOM behaves as drawn DOM from the moment hydration completes. Replay also has an unsolved semantic question: which render an interaction made before the client had any `Render` should be dispatched with.

**Known consequence:** user input before hydration into a slot the client tree realizes as a present property value (typing into an `input` whose `value` is `textProperty`) is overwritten at adoption. That is what realizing the tree means. Preserving such input is future work, together with replay.

## 10. The first SSR milestone

**Claim to prove:** `render-v1 → deterministic HTML → hydrate → normal PORT update`, for the supported subset, with semantic parity to client realization.

**In scope:**

1. `check.ts`, extracted from `port.ts` and shared: the tree check, plus adjacent-text-run refusal.
2. Table validation shared by both paths (§4.7).
3. `@valancex/port-web/server`, exporting `realizeHtml(tree, primitives): string`: elements (§4.2), escaping (§4.3), attributes (§4.4), text and children (§4.5), void elements (§4.6), refusals (§4.8). It is DOM-free, and an architecture test checks that its modules import nothing from the DOM path and use no DOM globals.
4. `WebPort.hydrate(tree): { adopted: true } | { adopted: false, mismatch }`: verification (§5.2), adoption (§5.4, §5.5), the mismatch policy (§7), and the `already-drawn` refusal.
5. The initial-value rule (§2A.2) made explicit in the client, and the probe for adopted elements.
6. The integration composer gains `hydrate(host)`: render, `port.hydrate`, retain, then follow renders as `show` does.
7. Documentation:
   - `CONTRACT.md` (the `hydrate` operation);
   - the port-web README;
   - the [Web value realization](../../architecture/2026-09-28-web-value-realization.md)'s SSR column, made final from §3;
   - the roadmap's V0.6 to V0.8.

**Supported subset:** primitives realized as normal or void elements with `attribute`, `booleanAttribute` and absent `property`/`textProperty` slots; text runs without U+0000; unknown components; any event realization (events aren't serialized).

**Exit criteria:** every test in §12 passes, from a clean install, alongside the existing suite; the slice runs server → HTML → hydrate → click → NEXUS command → update in place on a hydrated node.

## 11. Explicitly future work

- streaming SSR, async or streamed components, partial, progressive or island hydration;
- event replay, and preserving pre-hydration input;
- client routing, universal data fetching, server component semantics;
- **deferred property slots:** a structured server result that lists present property values the HTML can't show, for a composer that accepts them being applied at hydration. It needs a decision on whether showing server HTML without them is acceptable, and that decision isn't PORT's to take implicitly;
- server-side detection of parser-restructured nestings (§4.8), beyond the test helper;
- patching or partial recovery on mismatch;
- raw text, escapable raw text, `template` and foreign (SVG, MathML) elements;
- hydrating into a container that holds other content besides PORT's;
- a snapshot-transfer helper. That is application or composer code, never NEXUS's or PORT's.

## 12. Tests, defined before implementation

Semantic comparison, not string comparison. The helpers are defined once in `packages/port-web/test/ssr-support.ts`:

- **`parse(html)`**: a full-document parse, `<!doctype html><html><body><main>HTML</main>`, in a fresh DOM, as a page load would parse it. It is not `innerHTML` on an existing element.
- **`realized(container)`**: a description of what is realized. For each node, in order: the element's `localName` and namespace, its attribute **set**, and its child list (text data, empty text nodes included), plus each property-class slot's value read from the element. Two containers realize the same semantics exactly when their descriptions are equal.
- **Parity:** for a tree `T`, `realized(hydrated(parse(realizeHtml(T))))` equals `realized(drawn(T))`, and `hydrate` returns `{ adopted: true }`. It is used for every supported case below.

### Serialization (`test/ssr-serialize.test.ts`)

| Case | Asserts |
|---|---|
| string attribute | parity; the parsed attribute equals the string, including `& < > " '`, CR, a C1 character and a non-BMP character |
| canonical `propText` | parity for a number (including `1e+21`, `5e-324` and `0.30000000000000004`), `true`, `false` and `null` in `attribute` slots. The value comes from `propText`, proved by a hand-written tree whose `propText` differs from any formatter's output |
| boolean attribute | `true` present with value `""`, and `false` and absent both omitted; parity |
| escaped text | parity for text with `&`, `<`, `>`, CR, CRLF, C1, a leading LF under `pre`, and markup-like strings (`</main><script>`) |
| nested children | parity for a multi-level tree, with elements and text interleaved |
| empty text | an empty run produces no output, and hydration inserts it: parity, including its position between elements |
| unknown component | placeholder and children; parity |
| unsupported value refusal | a list or record in `attribute`: `unrealizable-value`; a scalar without `propText`: `missing-prop-text`; no output |
| unsupported realization refusal | a missing prop, event or void children: the same codes as `draw` |
| server-only refusals | a present `property` or `textProperty`: `unserializable-prop`; U+0000 in text or an attribute: `unserializable-text`; `script`, `textarea`, `svg` or `template` as an element: `unserializable-element` |
| table validation | a duplicate attribute, a reserved `data-component`, an invalid element or attribute name: `invalid-primitives`, on both sides |
| determinism | the same tree and table, with the table's key order permuted, give byte-identical output |
| MESH conformance | every `values/` case in an `attribute` slot: parity, or the same refusal as the client |

### Hydration (`test/ssr-hydrate.test.ts`)

| Case | Asserts |
|---|---|
| exact matching tree | `{ adopted: true }`; **every server DOM node is kept** (identity); parity |
| text mismatch | the server text differs: `{ adopted: false, mismatch.class: "text" }`; the result equals `draw` |
| attribute mismatch | a changed value, a missing attribute, an extra attribute, and a boolean attribute's presence: each is its class, and the result equals `draw` |
| element mismatch | another tag; a parser-restructured nesting (`<button>` in `<button>`) |
| keyed child mismatch | a child added, removed or reordered on the server: child-count or element mismatch, then a fresh draw with no server node reused |
| container mismatch | whitespace or a comment around the root |
| unsupported server realization | a tree the client can't realize: `hydrate` throws with the check's code, and the container is untouched |
| stale render | the server rendered state S1 and the client hydrates S2: visible difference → `draw`. The server rendered another program with identical visible content → adopted, and reports use the client tree's handler identifiers, which dispatch with `R_c` |
| properties | the client tree has a present `property` → applied at adoption; an absent one → the adopted element's current value kept; a later update present → absent → the probe's initial value |
| precondition | `hydrate` after `draw`: `already-drawn` |
| adoption failure (added in the v0.2 audit, `test/ssr-invariants.test.ts`) | a controlled setter that throws during adoption: verification succeeded and adoption began, the setter was reached once, `adoption-failed` with the setter's error as `cause`, neither `{ adopted: true }` nor a mismatch, no fresh draw or retry, and the resulting state stated explicitly (partly adopted DOM, nothing drawn, no listeners) |
| events | before `hydrate`, clicks report nothing; after it, MESH resolution holds (the conformance `events/` cases, run on hydrated DOM); after a mismatch → draw, the same |

### Continuity, through the slice (`integration/test/ssr.test.ts`)

One Node process, two DOMs:

1. **Server:** the NEXUS application with state S, the host for MESH's slice, `realizeHtml(render.tree)`.
2. **Browser:** a new NEXUS application initialized with S, the same program, and a composer that calls `hydrate(host)`.

Then:

- **draw the server representation:** the parsed page shows `expectedFirstHtml`'s semantics (by `realized`, not by string);
- **hydrate:** adopted, with the server's `<img>` and `<button>` kept;
- **event dispatch using the hydrated render:** a click on Ada's avatar is dispatched with `R_c`, and its intent equals MESH's `select-first.intent.json`;
- **NEXUS update, then PORT update:** a click on Refresh → `users.refresh` → a new render → `update`, and the **same, server-created** `<img>` now has `src="ada-2.png"`;
- **keyed reconciliation:** every server node is still in place after the update;
- **mismatch path:** the browser initialized with `second.json` → a mismatch → draw → the same continuity afterwards;
- **v0.6 values through SSR:** the `aria-disabled` variant of the slice serializes MESH's `propText` and hydrates with parity.

### Semantic parity (a property test over the conformance trees)

For MESH's `values/` and `events/` trees, and every tree in the port-web tests that the server accepts: `realized(hydrate(parse(realizeHtml(T))))` equals `realized(draw(T))`. For every tree the server refuses, the client either refuses with the same code, or the refusal is one of §4.8's server-only codes.

## 13. Release integration dependency

`@valancex/nexus` 0.8.0 declares `@valancex/mesh-runtime` `^0.5.0`. The PORT workspace root overrides that one range (`pnpm.overrides`: `"@valancex/nexus>@valancex/mesh-runtime": "^0.6.0"`) so the slice runs on one v0.6 runtime.

> **NEXUS must publish a release accepting MESH runtime 0.6 before the temporary PORT override can be removed.**

- The override is a test-workspace pin, not architecture. `@valancex/port-web` has no NEXUS dependency, and its peer range is `@valancex/mesh-runtime ^0.6.0` on its own merits.
- SSR adds no reason to keep the override, and none of this design depends on it.
- Once NEXUS releases, the override is deleted and the `mesh-v06` integration test ("NEXUS's host renders with the one mesh-runtime the slice uses") keeps checking the result.

## 14. Answers to the hydration identity questions

| Question | Answer |
|---|---|
| What identifies a render node across server and client? | Its position in the tree, which within one program is its key (5.1), verified by element type, attributes and text (5.2) |
| Are keys sufficient? | Keys aren't needed in the HTML. Keys are assigned from the client's tree; position does the pairing and verification the proof |
| Are keys local or globally meaningful? | Local to one program (runtime manual). Nothing in hydration compares keys across programs |
| Structurally different trees on server and client? | Detected as element or child-count mismatch → fresh draw (§7) |
| Which attributes and properties are compared? | Every attribute, as an exact set (§5.2). Properties aren't compared: server HTML has none (§2A), and adoption applies the client tree's |
| Which DOM nodes can be reused? | All of them, but only when the entire tree verifies. Otherwise none (§7) |
| An event handler changes but the node remains? | Bindings are read at resolution from the drawn tree. After hydration they are the client tree's; an update replaces a node's bindings and keeps its node, as today |
| How is the NEXUS render snapshot associated with the hydrated program? | The composer hydrates with the client host's `R_c` and retains it. `R_s` never crosses (§6) |
| How does the composer establish that the hydrated tree is the displayed program? | By calling `hydrate` for the program it knows the server rendered. PORT's verification then proves the DOM displays exactly that tree, or PORT draws it. Either way, the drawn tree is the retained render's (§6, §8) |
| Is program identity needed in render-v1? | No (§5.2) |

## 15. Unresolved questions

None block the first milestone. For review:

1. **Pre-hydration input into present property slots is overwritten** (§9). Accepted for v1; revisit with event replay.
2. **Deferred property slots** (§11): whether a server may ever emit HTML that lacks a present property value, with metadata, is a product decision about what server HTML must show. v1 refuses.
3. **Cross-class slot interplay on one element** (for example `attribute("value")` with `textProperty("value")` on an `input`): the table validation (§4.7) doesn't forbid it, and the platform couples them. It's the table author's hazard on the client today. It could become an `invalid-primitives` rule if it causes a real bug.
4. **Parser-restructured nestings** are found only at hydration or by the test helper (§4.8).
