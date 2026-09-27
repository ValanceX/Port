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
- **`report(handler, payload?)`** is called when a realized event fires, with the drawn tree's handler identifier and the payload the event's realization builds. An event with no payload is reported without one.

It uses no browser globals. Every DOM object comes from `container.ownerDocument`, so it runs against any DOM implementation.

## Primitives

MESH has no Valance-wide set of primitive components: each application's manifest declares its own. So the Web PORT is given their realizations:

- **`element`**: the tag the primitive becomes.
- **`props`**: each prop as `attribute(name)` (a string, as given; absent removes it) or `booleanAttribute(name)` (`true` sets it; `false` or absent removes it). Prop realizations are data, not functions, so the same table can later drive server rendering.
- **`events`**: each event as a DOM event `type`, with an optional `payload(event)` that builds the payload the manifest declares.

## What it refuses

It checks every tree in full before touching the DOM, so a refused tree changes nothing. It throws a `WebRealizationError` whose `code` is:

| `code` | When |
|---|---|
| `unsupported-tree` | the tree isn't `format: "mesh-render"`, `version: 1` |
| `unrealized-prop` | a prop has no realization for its primitive |
| `unrealized-event` | an event has no realization for its primitive |
| `unrealizable-value` | a value doesn't fit its realization: a number, list, record or `null` for an attribute (MESH gives no text for it, and the PORT doesn't format values), or a non-boolean for a boolean attribute |
| `unrealizable-children` | a node has children (even an empty text run), but its primitive is realized as an HTML void element such as `img`, which can't hold any |
| `duplicate-key` | two parts of a tree share a key |
| `not-drawn` | `update` before `draw` |

An unknown render-v1 *property* is different: it is ignored, as MESH's schema requires (see the contract's [What may be ignored](../../docs/CONTRACT.md#what-may-be-ignored-and-what-may-not)).

A component with no realization isn't refused. It's drawn as a `<valance-unknown data-component="…">` element with its children inside, so the mistake is visible.

## Event propagation is not decided

When a bound node sits inside another bound node, a click on the inner one currently reports **both** handlers, inner first. That is the DOM's bubbling, and it also happens between differently named events realized as the same DOM event type. MESH doesn't define propagation, so this is **not** Valance semantics and may change. Don't rely on it. `test/propagation.test.ts` pins today's behavior so any change is visible; the [event propagation audit](../../docs/architecture/2026-09-27-event-propagation-audit.md) explains the open question.

## Not yet

Accessibility semantics beyond what a realization table chooses, styling, event delegation, server rendering and hydration. See the [roadmap](../../docs/ROADMAP.md).
