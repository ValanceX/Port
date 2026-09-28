# @valancex/port-web

The Web PORT: realizes MESH render trees as DOM, keeps each node's DOM identity across updates, and reports what the user does as handler identifiers and payloads. It is the Web binding of the [PORT contract](../../docs/CONTRACT.md).

```ts
import { attribute, booleanAttribute, createWebPort } from "@valancex/port-web";

const port = createWebPort({
  container: document.querySelector("#app")!,
  // The application's primitives, as this application realizes them on the Web.
  primitives: {
    page: { element: "section", props: { title: attribute("aria-label") } },
    text: { element: "span" },
    button: { element: "button", props: { disabled: booleanAttribute("disabled") }, events: { click: { type: "click" } } },
  },
  // The composer dispatches each report with the Render whose tree is drawn.
  report: (handler, payload) => { /* host.dispatch(drawnRender, handler, payload) */ },
});

port.draw(render.tree);   // the first tree, or one from a different program
port.update(next.tree);   // a later tree from the same program: updated in place
port.unmount();
```

## What it does

- **`draw(tree)`** realizes a render-v1 tree afresh inside `container`, replacing whatever was there. Use it for the first tree, and for any tree from a different program: keys aren't comparable across programs.
- **`update(tree)`** brings the drawn tree to `tree`, from the same program, in place. Every key keeps its DOM node; only attributes and text that differ are written.
- **`unmount()`** empties the container. Nothing is reported afterwards.
- **`report(handler, payload?)`** is called at most once per interaction, for the one binding MESH's event resolution selects, with the drawn tree's handler identifier and the payload the event's realization builds. An event with no payload is reported without one.

It uses no browser globals. Every DOM object comes from `container.ownerDocument`, so it runs against any DOM implementation.

## Primitives

MESH has no Valance-wide set of primitive components: each application's manifest declares its own. So the Web PORT is given their realizations:

- **`element`**: the tag the primitive becomes.
- **`props`**: which DOM slot each prop goes to. Realizations are data, not functions, so the same table can later drive server rendering.
- **`events`**: which DOM event `type` constitutes each event, with an optional `payload(event, element)` that builds the payload the manifest declares (`element` is the receiving node's). One DOM event type may constitute at most one event of a primitive.

### Props: native slots and text-only slots

A DOM attribute and a DOM property are different slots. An attribute holds only text, and the DOM would stringify anything else by its own rule, which isn't MESH's. A property is typed. So each prop is realized one of MESH's two ways (spec §9.8.7), never by coercion:

| Realization | Slot | Takes |
|---|---|---|
| `attribute(name)` | content attribute: **text only** | a string as given; a number, boolean or `null` as the node's `propText` (MESH's text); absent removes it |
| `textProperty(name)` | `DOMString` property, such as `value`: **text only** | as `attribute`; absent leaves the element's own initial value |
| `booleanAttribute(name)` | boolean attribute: **native**, by presence | `true` sets it, `false` or absent removes it |
| `property(name, "boolean")` | IDL `boolean` property: **native** | a boolean |
| `property(name, "number")` | IDL `double` property: **native** | the number itself (never a `long` or `float` property, which would truncate or round) |
| `property(name, "value")` | a property that keeps any value, such as a custom element's: **native** | any value unchanged, lists, records and `null` included |

A list or record in a text-only slot, a value of another kind in a native slot, or a number, boolean or `null` in a text-only slot without a `propText` entry, is refused. The PORT never calls `String()`, `JSON.stringify` or a formatter on a value. The full table, with each case's SSR consequence, is the [Web value realization](../../docs/architecture/2026-09-28-web-value-realization.md).

### Events: MESH's event resolution

An interaction reaches at most one binding (MESH spec §9.9). The Web PORT listens once per DOM event type, on the container, in the capture phase. For each DOM event it finds the innermost drawn node the event's target is in, then walks the **drawn tree** (not the DOM) towards the root, and reports the first node whose primitive realizes an event with that DOM type and that binds it. Nothing after it is reported.

So the DOM's propagation decides nothing: a DOM event that doesn't bubble resolves the same, code inside the container calling `stopPropagation` doesn't change the result (code outside it that stops the DOM event before it reaches the container stops the interaction itself, as with any DOM listener), and the PORT itself stops nothing, so the page still sees the DOM event.

## What it refuses

It checks every tree in full before touching the DOM, so a refused tree changes nothing. It throws a `WebRealizationError` whose `code` is:

| `code` | When |
|---|---|
| `unsupported-tree` | the tree isn't `format: "mesh-render"`, `version: 1` |
| `unrealized-prop` | a prop has no realization for its primitive |
| `unrealized-event` | an event has no realization for its primitive |
| `unrealizable-value` | a value its slot can't hold: a list or record in a text-only slot (MESH gives them no text), or a value of another kind in a native slot |
| `missing-prop-text` | a number, boolean or `null` in a text-only slot, with no `propText` entry (a tree from before MESH v0.6); the PORT doesn't make MESH text |
| `unrealizable-children` | a node has children (even an empty text run), but its primitive is realized as an HTML void element such as `img`, which can't hold any |
| `duplicate-key` | two parts of a tree share a key |
| `not-drawn` | `update` before `draw` |
| `invalid-primitives` | thrown by `createWebPort`: the table maps one DOM event type to two events of one primitive |

An unknown render-v1 *property* is different: it is ignored, as MESH's schema requires (see the contract's [What may be ignored](../../docs/CONTRACT.md#what-may-be-ignored-and-what-may-not)).

A component with no realization isn't refused. It's drawn as a `<valance-unknown data-component="…">` element with its children inside, so the mistake is visible.

## Not yet

Accessibility semantics beyond what a realization table chooses, styling, server rendering and hydration. See the [roadmap](../../docs/ROADMAP.md).
