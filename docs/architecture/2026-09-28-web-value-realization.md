# Web value realization

**Date:** 2026-09-28
**Scope:** the Web PORT (`@valancex/port-web`) only. This is the Web PORT's own documentation of how it realizes render-v1 values on its target. It is **not** a universal PORT contract: another PORT picks its own slots and records its own table.
**Against:** MESH v0.6.0 (`a8a046f`): spec §9.7.7 (the text of a value), §9.7.8 (no text for lists and records), §9.8.2 (how each value crosses), §9.8.7 (realization); `@valancex/mesh-runtime` 0.6.0's `RenderNode.propText`.
**Supersedes** the open questions of the [value realization audit](./2026-09-27-value-realization-audit.md), which MESH v0.6 answered.

---

## The rule the Web PORT implements

MESH owns a value and its text. The Web PORT owns only where each prop goes, and puts it there in one of MESH's two ways (§9.8.7):

```text
render-v1 node
  ├── props[name]      the semantic value     ──▶ a native slot of its kind, which holds it exactly
  └── propText[name]   its MESH text          ──▶ a text-only slot, copied as given
                       (a string's text is its own value, so it has no entry)
```

- A **text-only slot** gets a string prop's value, or the `propText` entry for a number, boolean or `null`. A list or record has no text and is refused. A number, boolean or `null` with no entry is refused too: the PORT never makes MESH text.
- A **native slot** gets the value itself, and only a value of the slot's kind. Anything else is refused. `propText` is never used for a native slot.
- **Absent** (no entry in `props`) is omission in every slot. It is never `null` and never a default MESH would supply.
- **Nothing else.** No `String(value)`, template literal, `JSON.stringify`, number formatting, `null` spelling, or DOM coercion (`setAttribute` or a `DOMString` setter given a non-string) is ever used to make a value's text.

One function, `realizeProp` in `packages/port-web/src/realize.ts`, decides every prop's output (absent, text, or native value) from the node and the slot, with no DOM. The DOM writer only places what it decided. A server writer will place the same outputs as HTML, so client and server can't realize a value differently.

## DOM property versus HTML attribute

These are different slots with different semantics, and the Web PORT never treats one as the other.

- **An HTML content attribute holds only text.** `setAttribute(name, x)` converts a non-string by `ToString`, which is platform formatting and forbidden. So an attribute is a text-only slot, with one exception: a **boolean attribute** holds a boolean state by its presence, which is native (§9.8.7 names "the presence of something").
- **A DOM property is typed** (WebIDL). An IDL `double` holds a binary64 number exactly; an IDL `boolean` a boolean; a `DOMString` holds only text; a custom element's own JavaScript property may hold any value unchanged. Integer (`long`) and `float` properties truncate or round, so they are **not** native slots for a MESH number, and the Web PORT offers no realization for them.
- **A property may reflect to an attribute** (`progress.value` reflects its number to the `value` attribute by the platform's own `ToString`). On the client that is the platform keeping its own state in step, not PORT presenting the value as text. It matters for SSR: the reflected text isn't MESH's, so a property slot has no HTML form (see [SSR](#ssr)).

## Slot classes

Every prop path a realization table can name falls into exactly one class.

| Class | Realization kind | DOM slot | Realization |
|---|---|---|---|
| 1. native DOM property | `property(name, "boolean")` | an IDL `boolean` property (`checked`, `disabled`) | native |
| | `property(name, "number")` | an IDL `double` property (`progress.value`, `meter.value`) | native |
| | `property(name, "value")` | a property that keeps any JavaScript value unchanged (a custom element's own property) | native |
| 2. native DOM attribute | `booleanAttribute(name)` | an HTML boolean attribute (`disabled`, `hidden`), by presence | native |
| 3. text-only target slot | `attribute(name)` | an HTML content attribute (`aria-label`, `src`, `aria-pressed`) | MESH text |
| | `textProperty(name)` | a `DOMString` property (`value`, `title`) | MESH text |
| | a text run (not a prop) | a `Text` node's data | MESH text (`text`) |
| 4. unsupported | anything the table doesn't list for the primitive | none | refused: `unrealized-prop` |

## The matrix

For each realization kind and MESH value kind: the target slot, the way it is realized, the render-v1 field it comes from, what server HTML would need, and what happens otherwise. *Absent* is the same for every kind of slot, and has its own row per slot.

### `attribute(name)`: text-only, a content attribute

| MESH value | Realized as | Source field | SSR HTML equivalent | Failure |
|---|---|---|---|---|
| string | the attribute's value, as given | `props[name]` | `name="…"`, the same text, escaped (escaping is serialization, not conversion) | — |
| number | the attribute's value | `propText[name]` | yes: the same `propText`, escaped | no entry: `missing-prop-text` |
| boolean | the attribute's value (`"true"`/`"false"`, as MESH gives them) | `propText[name]` | yes: the same `propText` | no entry: `missing-prop-text` |
| `null` | the attribute's value (`"null"`) | `propText[name]` | yes: the same `propText` | no entry: `missing-prop-text` |
| list | — | — | — | `unrealizable-value`: no MESH text (§9.7.8) |
| record | — | — | — | `unrealizable-value`: no MESH text (§9.7.8) |
| absent | the attribute is removed | — | no attribute | — |

### `textProperty(name)`: text-only, a `DOMString` property

| MESH value | Realized as | Source field | SSR HTML equivalent | Failure |
|---|---|---|---|---|
| string | the property, as given | `props[name]` | **none**: a property isn't serialized; SSR v1 refuses it | — |
| number, boolean, `null` | the property | `propText[name]` | **none** (as above) | no entry: `missing-prop-text` |
| list, record | — | — | — | `unrealizable-value` |
| absent | the element's own initial value for the property | — | none | — |

### `booleanAttribute(name)`: native, presence

| MESH value | Realized as | Source field | SSR HTML equivalent | Failure |
|---|---|---|---|---|
| `true` | the attribute, present (empty value) | `props[name]` | yes: `name` present | — |
| `false` | the attribute, removed | `props[name]` | yes: no attribute | — |
| string, number, `null`, list, record | — | — | — | `unrealizable-value` (a `propText` entry doesn't change that) |
| absent | the attribute, removed | — | no attribute | — |

`false` and absent realize the same way. That is the realization table's explicit choice for a primitive whose prop means the same by both. A table that must tell them apart uses a text-only slot instead (`aria-pressed` via `attribute`).

### `property(name, holds)`: native, a typed DOM property

| MESH value | `holds` | Realized as | Source field | SSR HTML equivalent | Failure |
|---|---|---|---|---|---|
| boolean | `"boolean"` | the property | `props[name]` | **none**; SSR v1 refuses it | — |
| number | `"number"` | the property, the binary64 value itself | `props[name]` | **none**, even when the platform reflects it to an attribute: that text is the platform's `ToString`, not MESH's | — |
| any value | `"value"` | the property, the same JavaScript value (lists and records as the frozen tree's own structures) | `props[name]` | **none** | — |
| a kind other than `holds` | `"boolean"`, `"number"` | — | — | — | `unrealizable-value` |
| absent | any | the element's own initial value for the property | — | none | — |

### Text runs

| MESH value | Realized as | Source field | SSR HTML equivalent | Failure |
|---|---|---|---|---|
| text (MESH made it from strings, numbers, booleans, `null` and absent, §9.7.7) | a `Text` node | the run's `text` | yes: the text, escaped. An **empty** run has no HTML form (HTML can't express an empty text node) | — |

## The slice's application, row by row

The integration slice's table (`integration/test/app.ts`), against MESH's slice manifest.

| Primitive | Prop | Declared type | Realization | Class | Source | SSR | Failure |
|---|---|---|---|---|---|---|---|
| `page` → `section` | `title` | string | `attribute("aria-label")` | text-only | `props` | `aria-label="…"` | — |
| `avatar` → `img` | `src` | string? | `attribute("src")` | text-only | `props`; absent removes | `src="…"` or none | — |
| | `alt` | string | `attribute("alt")` | text-only | `props` | `alt="…"` | — |
| | `size` | string | `attribute("data-size")` | text-only | `props` | `data-size="…"` | — |
| `button` → `button` | `disabled` | boolean | `booleanAttribute("disabled")` | native | `props` | `disabled` or none | a non-boolean: `unrealizable-value` |
| `text` → `span` | — | — | — | — | — | — | — |

`integration/test/mesh-v06.test.ts` also realizes `button.disabled` as `attribute("aria-disabled")`, a text-only slot, where the DOM gets MESH's `propText` (`"true"`, then `"false"` after a state change) from the runtime inside NEXUS's host.

## SSR

Settled in the [PORT Web SSR design](../superpowers/specs/2026-09-28-port-web-ssr.md) (§2A, §3), under review:

- **Serializable, by the same `realizeProp` outputs:** `attribute` (a string's value or MESH's `propText`, escaped), `booleanAttribute` (presence), non-empty text runs, and the unknown-component placeholder. No second formatting exists.
- **Omission on both sides:** an absent prop in any slot, including `property` and `textProperty`.
- **No HTML form, so SSR v1 refuses the tree** (`unserializable-prop`): a *present* value in `property` or `textProperty`. A browser's reflection of a property to an attribute is platform behavior, not a representation, and PORT never derives one. An application that wants a prop in server HTML realizes it as an attribute.
- **No HTML form, restored at hydration:** an empty text run. HTML can't express an empty text node, and the tree fixes its position.
- **Serialization-only refusals:** U+0000 in text (HTML can't hold it) and elements whose content HTML parsing doesn't give back as the tree says (raw text, `template`, SVG, MathML).

## Failure behavior

Every failure is a `WebRealizationError`, thrown while checking the tree, before the DOM is touched: a refused tree changes nothing.

| `code` | Meaning |
|---|---|
| `unrealized-prop` | the table has no slot for the prop (class 4) |
| `unrealizable-value` | the value can't be held by its slot: a list or record in a text-only slot, or a value of another kind in a native one |
| `missing-prop-text` | a number, boolean or `null` in a text-only slot, with no `propText` entry. The runtime always gives one, so this means the tree didn't come from MESH v0.6 or later |

Tests: `packages/port-web/test/values.test.ts` (each class), `packages/port-web/test/conformance.test.ts` (MESH's `values/` vectors, every case in a text-only and a native slot), `packages/port-web/test/port.test.ts` (refusals leave the DOM unchanged) and `integration/test/mesh-v06.test.ts` (the slice).
