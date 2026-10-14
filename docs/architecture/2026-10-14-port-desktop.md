# The Desktop PORT

2026-10-14. The second PORT. It realizes `render-v1` as a native window on Linux, Windows and macOS. This note says why it is its own package, what it promises, what its vocabulary is and why, and how an engine in another process drives it. The reasons for the vocabulary, with the evidence and the alternatives, are in Valance's [native vocabulary investigation](https://github.com/ValanceX/Valance/blob/main/docs/application-model/NATIVE-VOCABULARY.md).

## Why a package of its own

The roadmap said a native PORT would follow evidence from the Web PORT, not speculation, and that PORTs share a contract and no code. Both still hold:

- **The contract is shared; the code is not.** `packages/port-desktop` depends on no other PORT, and `@valancex/port-web` does not depend on it. There is still no shared `@valancex/port` package: what the two share is `render-v1` and the contract's three operations, which are data and prose.
- **The language follows the target.** The Web PORT is TypeScript because the DOM is JavaScript-native. A native window is Rust's to draw: it is a crate (`valancex-port-desktop`), not an npm package.
- **The vocabulary is the target's.** MESH has no primitive set of its own. The Web PORT's application supplies a table of tags; the Desktop PORT ships its own, as data, in `vocabulary.json`.
- **Evidence.** The first application written for it ([`examples/todo`](https://github.com/ValanceX/Valance/tree/main/examples/todo) in Valance) ran on a text target, in a DOM (realized by a table of eight entries) and in this window, from the same compiled screens.

## What it promises

| Contract (version 1) | Desktop PORT |
|---|---|
| Accepts `mesh-render` version 1, refuses anything else | `Port::draw` and `update` return `unsupported-format`; nothing changes |
| Ignores properties it does not know | Yes (`tests/contract.rs`) |
| `draw` realizes afresh | Replaces the whole screen; the text fields' retained state is dropped |
| `update` realizes in place, by key | Replaces the tree; a text field's state is kept by its `key` (what is being typed survives) |
| `unmount` safe twice | Yes; the PORT stays usable |
| `patch` (optional) | Not supported. `update` of the whole tree is always valid |
| Reports `(handler, payload)` and nothing else | `Report`; no interpretation |
| Never infers program continuity | The composer says `draw` or `update`; the PORT does not decide |
| A component it does not know is surfaced, not dropped | Drawn as a visible `<name>` marker with its children |

### A text field is not the Web PORT's text field

The Web PORT's `controlled` field makes the DOM property equal to the rendered text after every presentation, whatever was typed. That is sound there because the presentation is synchronous with the event. Here the engine is another process: it answers a keystroke after the next one was typed, and taking the answer at face value deleted a letter (found in the first run: "Groceries" appeared as "Goceries"). The Desktop PORT's rule: **the person's text wins until the engine changes the value itself.** A value that answers something the PORT reported leaves the buffer alone; a value that is not an answer (a save, a discard, a clear) replaces it. `Field` implements it; `src/field.rs` has the tests.

## The vocabulary

Seven components: `column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`. There is no `window` component: the window is the host's (its title comes from the application, its size from the host, and whether it may close from the application's guards), the way it is in SwiftUI (`Window` is a scene, and `navigationTitle` follows where you are) and GTK (the title is set on the window, not in its content). Their props and events are in the [README](../../packages/port-desktop/README.md#the-vocabulary) and in `vocabulary.json` (a MESH manifest, so a build derives what a template may use from the same file the window draws).

Design rules, from the ecosystem's [API design principles](https://github.com/ValanceX/Mesh/blob/main/docs/standards/api-design-principles.md) (the investigation applies them one by one):

1. **Few concepts.** A newcomer's first application needs seven, and no fixed attribute, style or class.
2. **Names a developer from any platform already knows.** A window, rows and columns, text, a button, a checkbox, a text field.
3. **Two verbs.** `click` for a button, and `change` for a control whose value the application owns: it carries the new value, so the same report twice is the same state. `click` is device-independent where it is defined (a DOM `click` is also raised by the keyboard and by assistive technology).
4. **No markup, no web hooks.** Text is text. There is no `class`, `id` or `tabindex`.
5. **A target's own things stay the target's.** Anything beyond the eight (images, links, styling) is added to this vocabulary deliberately, not by passing a toolkit's widget through.

## The host protocol

An engine in another process (the application, in JavaScript or anything else) drives the PORT: the engine is the **composer** of the contract and holds NEXUS and MESH; the PORT never sees a command, a state or a route. The streams are the engine's stdout and stdin as the PORT sees them; each message is one line of JSON, UTF-8, `\n`-terminated.

| Engine to PORT | Meaning |
|---|---|
| `{"op":"hello","protocol":1,"app":"name"}` | First line. A PORT that does not know the number stops. |
| `{"op":"title","title":"…"}` | What the window is called. Sent before the screen it goes with, and again when it changes. |
| `{"op":"draw","tree":RenderTree}` | The contract's `draw`. |
| `{"op":"update","tree":RenderTree}` | The contract's `update`. |
| `{"op":"unmount"}` | The contract's `unmount`; the window closes. |
| `{"op":"appearance","appearance":"light"\|"dark"\|"system"}` | How the application asks the window to look; `system` (the default, when it never asks) follows the person's own. |
| `{"op":"closeAnswer","allowed":true\|false}` | The answer to `closeRequested`. When allowed the engine is ending and `unmount` follows. |

| PORT to engine | Meaning |
|---|---|
| `{"op":"event","handler":"…","payload":JSON}` | A report. `handler` is copied from the tree; `payload` is optional plain data. |
| `{"op":"scheme","scheme":"light"\|"dark"}` | The system's colors, as the window sees them: sent when the window opens and whenever they change. The application learns them as state. |
| `{"op":"closeRequested"}` | The person asked to close the window. The PORT cancels the close and waits for `closeAnswer`. |
| `{"op":"link","href":"…"}` | The person activated a link. A link is an address, not an event: the tree carries its `href` and no handler. The PORT never opens an address itself; the engine decides what it means (the application owns navigation). |
| `{"op":"close"}` | The window has closed; the engine ends. A closed stream means the same. |

The engine treats the PORT as a separate program and bounds what it reads (lines of at most 64 KiB, handlers of at most 256 characters, payloads of plain data to a depth of 8); the PORT ignores a line that is not a message and says so on its error output.

## The content layer

`content.json` is a second MESH manifest, nine components: what Valance's content model produces (six block kinds and five inline kinds), named as WAI-ARIA names them (`paragraph`, `list`, `listitem`, `code`, `blockquote`, `image`, `strong`, `emphasis`, `link`; `heading` is in `vocabulary.json` with an optional `level`). The window draws all of them from real MESH output (`tests/fixtures/reader-index.json`, a whole page); images are drawn as their description until the PORT carries an image loader. It is part of what this PORT promises. The names are WAI-ARIA's, decided on the evidence in Valance's native vocabulary investigation; the web's own tag table is unchanged by that decision.

## Not yet

Patches, images, links, styling, keyboard events, accessibility, macOS in CI, and any mobile PORT (an engine in Node cannot ship in an iOS or Android app; see Valance's native parity note). The vocabulary investigation orders them.
