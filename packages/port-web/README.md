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

On a server, with no DOM:

```ts
import { realizeHtml } from "@valancex/port-web/server";

const html = realizeHtml(render.tree, primitives);   // the container's content
```

In the browser, over that HTML, with the client's own render of the same state:

```ts
const result = port.hydrate(render.tree);   // { adopted: true }, or { adopted: false, mismatch } after a fresh draw
port.update(next.tree);                    // as after draw
```

## What it does

- **`draw(tree)`** realizes a render-v1 tree afresh inside `container`, replacing whatever was there. Use it for the first tree, and for any tree from a different program: keys aren't comparable across programs.
- **`update(tree)`** brings the drawn tree to `tree`, from the same program, in place. Children are matched by key, never by position: every key present in both trees keeps its DOM node (moved if its order changed), a new key gets a new node, a key that is gone has its node disposed, and a key that leaves and later returns gets a fresh node. A key whose component changed is replaced. Only attributes and text that differ are written.
- **`patch(patches)`** (since 0.4.0) applies a MESH `render-patch-v1` list (from MESH's `update`) to the drawn tree in place, instead of `update(tree)`. `setProp`, `removeProp` and `setText` change a kept part; `insert`, `remove` and `move` add, take away and reorder parts by key, and a moved part keeps its DOM node; `replace` is a `draw`. The result is what `update` of the full new tree gives. The whole list is checked before the DOM is touched, each operation against the effect of the ones before it, so a list it can't realize changes nothing (`unknown-key`, `duplicate-key`, `unsupported-patch`, `unrealized-prop`, `unrealizable-value`, `missing-prop-text`); an operation it doesn't know is refused, never skipped. If a DOM setter then throws, `patch` throws `patch-failed` (the steps before it stay applied) and you recover with `draw`. Its types, `RenderPatches` and `RenderPatch`, are this package's own. See [the contract](../../docs/CONTRACT.md#patch).
- **`hydrate(tree)`** takes over server HTML in `container`, with nothing drawn. See [Server HTML and hydration](#server-html-and-hydration).
- **`unmount()`** empties the container. Nothing is reported afterwards. It is synchronous, safe to call twice or before anything was drawn, and leaves the PORT usable: `draw` (or `hydrate`) draws again, while `update` and `patch` refuse with `not-drawn`. Where the platform has `Symbol.dispose`, the PORT has `[Symbol.dispose]()` (unreleased), the same as `unmount()`, so `using port = createWebPort(...)` unmounts at the end of a block. The `using` statement itself needs a runtime or transpiler that supports explicit resource management (it is a syntax error on Node 22); otherwise call `unmount()`.
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
| `attribute(name)` | content attribute: **text only** | a string as given (a URL attribute such as `href` or `src` refuses a `javascript:` or `vbscript:` URL, and a `data:` URL in `href`, `action`, `formaction` or `cite`: `unrealizable-value`); a number, boolean or `null` as the node's `propText` (MESH's text); absent removes it |
| `textProperty(name)` | `DOMString` property, such as `value`: **text only** | as `attribute`; absent leaves the element's own initial value |
| `controlled(name)` | content attribute **and** the same-named DOM property, for a field the user edits (an input's `value`): **text only** | as `attribute`, serialized and hydrated as the attribute; and after every `draw`, `update` and `hydrate` the property is made equal to the rendered text (absent: the element's own initial value). See [Controlled fields](#controlled-fields) |
| `booleanAttribute(name)` | boolean attribute: **native**, by presence | `true` sets it, `false` or absent removes it |
| `property(name, "boolean")` | IDL `boolean` property: **native** | a boolean |
| `property(name, "number")` | IDL `double` property: **native** | the number itself (never a `long` or `float` property, which would truncate or round) |
| `property(name, "value")` | a property that keeps any value, such as a custom element's: **native** | any value unchanged, lists, records and `null` included |

A list or record in a text-only slot, a value of another kind in a native slot, or a number, boolean or `null` in a text-only slot without a `propText` entry, is refused. The PORT never calls `String()`, `JSON.stringify` or a formatter on a value. The full table, with each case's SSR consequence, is the [Web value realization](../../docs/architecture/2026-09-28-web-value-realization.md).

### Events: MESH's event resolution

An interaction reaches at most one binding (MESH spec §9.9). The Web PORT listens once per DOM event type, on the container, in the capture phase. For each DOM event it finds the innermost drawn node the event's target is in, then walks the **drawn tree** (not the DOM) towards the root, and reports the first node whose primitive realizes an event with that DOM type and that binds it. Nothing after it is reported.

So the DOM's propagation decides nothing: a DOM event that doesn't bubble resolves the same, code inside the container calling `stopPropagation` doesn't change the result (code outside it that stops the DOM event before it reaches the container stops the interaction itself, as with any DOM listener), and the PORT itself stops nothing, so the page still sees the DOM event.

## What it refuses

It checks every tree in full before touching the DOM, so a refused tree changes nothing. The exceptions are `adoption-failed` and `patch-failed`, which aren't refusals of the tree or the list: a DOM property setter threw after hydration's verification (or a patch list's validation) had succeeded (see [Server HTML and hydration](#server-html-and-hydration)). It throws a `WebRealizationError` whose `code` is:

| `code` | When |
|---|---|
| `unsupported-tree` | the tree isn't `format: "mesh-render"`, `version: 1` |
| `unrealized-prop` | a prop has no realization for its primitive |
| `unrealized-event` | an event has no realization for its primitive |
| `unrealizable-value` | a value its slot can't hold: a list or record in a text-only slot (MESH gives them no text), or a value of another kind in a native slot |
| `missing-prop-text` | a number, boolean or `null` in a text-only slot, with no `propText` entry (a tree from before MESH v0.6); the PORT doesn't make MESH text |
| `unrealizable-children` | a node has children (even an empty text run), but its primitive is realized as an HTML void element such as `img`, which can't hold any |
| `duplicate-key` | two parts of a tree share a key, or a patch inserts one key twice |
| `unsupported-patch` | `patch` only: the list isn't `mesh-render-patch` version 1, has an operation this PORT doesn't know, has a `replace` among other operations, or names a key of the wrong kind |
| `unknown-key` | `patch` only: a patch names a key that is not in the drawn tree at that point |
| `patch-failed` | `patch` only: a DOM setter threw while applying a validated list. Earlier steps stay applied; recover with `draw` of a full tree |
| `not-drawn` | `update` or `patch` with nothing drawn (before `draw`, or after `unmount`) |
| `invalid-primitives` | thrown by `createWebPort` and `realizeHtml`: the table maps a prop by anything but one plain realization of a known kind, realizes two props as one attribute or one property, uses `data-component`, uses an element or attribute name the DOM and HTML don't both give back unchanged (lowercase, no special characters), or maps one DOM event type to two events of one primitive |
| `already-drawn` | `hydrate` with a tree already drawn. A drawn PORT is never cleared by it |
| `adoption-failed` | `hydrate` only: after verification succeeded, a DOM property setter threw during adoption. The setter's error is the `cause`. The DOM may be partly adopted and isn't rolled back; nothing is drawn. The one code for which the page may have changed |
| `unserializable-prop` | server only: a present value in a `property` or `textProperty` slot, which has no HTML form |
| `unserializable-text` | server only: U+0000 in a text run or attribute, which HTML can't hold |
| `unserializable-element` | server only: a primitive realized as `script`, `style`, `textarea`, `title`, `template`, `xmp`, `iframe`, `noembed`, `noframes`, `noscript`, `plaintext`, `svg` or `math`, whose content HTML parsing wouldn't give back as the tree says |

Handle a refusal by its `code`, never its message:

```ts
import { WebRealizationError } from "@valancex/port-web";

try {
  port.update(next.tree);
} catch (error) {
  if (error instanceof WebRealizationError) console.error(error.code, error.key);
  else throw error;
}
```

An unknown render-v1 *property* is different: it is ignored, as MESH's schema requires (see the contract's [What may be ignored](../../docs/CONTRACT.md#what-may-be-ignored-and-what-may-not)).

A component with no realization isn't refused. It's drawn as a `<valance-unknown data-component="…">` element with its children inside, so the mistake is visible.

## Server HTML and hydration

The design is the [PORT Web SSR design](../../docs/superpowers/specs/2026-09-28-port-web-ssr.md). `hydrate` is Web-specific, not a PORT contract operation.

### Controlled fields

`textProperty` is live but has no HTML form, and `attribute` has one but stops affecting a field once the user has typed in it (the DOM's dirty-value rule). `controlled` is both, and states what a presentation guarantees:

- **After every `draw`, `update` and `hydrate`, the DOM property equals the rendered text** (or the element's own initial value, when the prop is absent), whatever the user did to the field since, and whether or not the rendered text changed. The property is written **only when it differs**, so a field that already agrees is untouched, and a **focused field keeps its selection** (clamped to the new length; assigning a property otherwise moves the caret to the end).
- **Nothing is written between presentations.** The PORT cannot know whether the application accepted an edit, and writing the old value back immediately would erase what the user is typing while the application is still deciding. So an edit the application declines by committing nothing stays in the field **until the next presentation**, which reasserts the application's value. A composer that wants the field corrected sooner must present again.
- Text typed before `hydrate` is replaced by the rendered text: the application's value is authoritative.
- It applies where the attribute and the property share a name (`value`). It is not for `checked`, `selected` or a `<textarea>`'s content.

**One pipeline.** `realizeHtml` validates the table, checks the tree and realizes every prop exactly as `draw` does (`check.ts`, `realize.ts`), then writes the outputs as HTML. It formats nothing. Escaping is `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;` in attributes, and CR → `&#13;` (a literal CR would parse as LF). Everything else stays literal, C1 characters included, since a reference to one parses as another character. Attributes are written in name order, so a tree has exactly one HTML. A refusal throws, with no output.

**What the server writes.** Server HTML supports:

| Realization | Server HTML |
|---|---|
| `attribute`, `controlled` | the string, or MESH's `propText`, escaped; absent: nothing |
| `booleanAttribute` | the attribute present for `true`; nothing for `false` or absent |
| `property`, `textProperty`: absent | nothing (omission on both sides) |
| `property`, `textProperty`: present | **refused**, `unserializable-prop`: a DOM property isn't HTML, and a browser reflecting one to an attribute doesn't make it one. Realize the prop as an attribute to have it in server HTML |
| non-empty text run | the text, escaped; U+0000 is refused. Under `pre` and `listing`, a leading LF gets the extra LF the parser drops |
| empty text run | nothing: HTML can't express an empty text node. Hydration puts it back |
| unknown component | `<valance-unknown data-component="…">`, with its children |
| events | nothing. Hydration binds them from the client's tree |

**Hydration, in two phases.**

1. **Verify.** Nothing in the DOM changes. The container must hold exactly one element. Each node's element must have the tag and HTML namespace its realization gives, **exactly** the attributes `draw` would write, and exactly its children (empty text runs left out). Each text node must have exactly its run's text.
2. **Adopt,** only if everything matched. Every server node is kept. Empty text nodes are inserted in their places, present property values from the client's tree are applied, and absent ones are left as they are. The drawn state is `draw`'s, and listeners are installed.

**Atomicity.** A tree is fully verified before adoption begins; structural verification is mutation-free. Adoption is not transactionally rollbackable across arbitrary DOM property setters. Hydration verification is mutation-free and atomic. Adoption occurs only after successful verification, but adoption itself is not rollbackable across arbitrary DOM property setters. A setter failure is reported as an adoption failure; PORT does not promise transactional rollback of external DOM side effects. A structural mismatch cannot cause partial adoption, because all verification completes before adoption begins. After `adoption-failed`: the writes adoption made before the failing setter (empty text nodes, property values, in document order) stay, and so does whatever the setter did; nothing is drawn, no listeners are installed, and there is no retry or fallback draw. The composer decides what to do next.

**Mismatch.** The first mismatch in document order (`container`, `element`, `component`, `child-count`, `text`, `attribute` or `boolean-attribute`) makes `hydrate` draw the tree afresh, with no server node kept, and return `{ adopted: false, mismatch: { class, key?, expected, found } }`. There is no patching. A nesting the HTML parser restructures (a `button` inside a `button`) shows up here.

**Properties.** A property slot's initial value, which a prop going from present to absent restores, is a fresh element's, never the adopted element's.

**Events around hydration.** Before `hydrate`, nothing is reported. Afterwards, MESH's resolution applies with the client tree's handler identifiers. HTML carries none. Interactions before hydration are not replayed. Hydration doesn't preserve input made before it: a slot the client's tree realizes as a present property is written, over whatever it held. A slot whose prop is absent isn't written at all, since PORT never writes an absent slot, so its state is left untouched; that is the absent-prop rule, not input preservation.

## Known limitations

These are the documented semantics of v0.2 and v0.3, not defects. Each is a different case:

- **Structural mismatch.** Server HTML that differs from the client's tree in any verified way (element, component, child count, text, attribute, boolean attribute, container) is never adopted: `hydrate` draws the whole tree afresh and reports the first mismatch. The page is correct, and the server-rendered DOM isn't reused.
- **Parser restructuring.** Some element nestings are rewritten by the browser's HTML parser (a `button` inside a `button`, a `div` inside a `p`, table content). The server doesn't model the parser, so these are caught only at hydration, as a structural mismatch, and drawn afresh.
- **Adoption setter failure.** A tree is fully verified before adoption begins; structural verification is mutation-free. Adoption is not transactionally rollbackable across arbitrary DOM property setters. If one throws during adoption, `hydrate` throws `adoption-failed`: writes already made stay, nothing is drawn, and there is no retry or fallback draw. The composer decides what to do next.
- **Pre-hydration input loss.** Input made before hydration isn't preserved. A slot the client's tree realizes as a present property is written over it. (An absent prop's slot is never written, as for any absent prop.)
- **Pre-hydration interaction loss.** Before `hydrate`, PORT reports nothing, and interactions made then are not replayed.
- **Several DOM event types from one gesture.** One interaction is one DOM event. A table that maps events to several DOM types one gesture produces gets several interactions.

## Not yet

Accessibility semantics beyond what a realization table chooses, styling, streaming or partial hydration, event replay, and preserving input before hydration. See the [roadmap](../../docs/ROADMAP.md).
