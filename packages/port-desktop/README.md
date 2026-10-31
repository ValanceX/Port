# @valancex/port-desktop (crate `valancex-port-desktop`)

The Desktop PORT: it realizes MESH render trees as a native window and reports what the person does as handler identifiers and payloads. **Version 0.4.0 (prepared; release tag `desktop-v0.4.0`; 0.3.1 is released).** Built and tested on Linux and Windows; macOS is not built or tested.

It is a Rust crate, because a native window is Rust's to draw (PORT's rule: an implementation's language follows its target; see the [architecture note](../../docs/explanation/design-records/2026-10-14-port-desktop.md)). It takes the same input as [`@valancex/port-web`](../port-web) and keeps the same [PORT contract](../../docs/reference/contract.md); what differs is the **vocabulary**: columns and rows, text, a heading, a button, a toggle, a checkbox, a text field, a choice group, two live regions, a caption and a static table, not HTML. The window itself (its title, its size, whether it may close) is the host's, not a template's.

## Five minutes

You write an application with Valance (its state, commands and screens), and the PORT draws it. You do not write the window.

```rust
// src/main.rs of a desktop app
fn main() -> eframe::Result {
    port_desktop::app::run(port_desktop::app::Options {
        title: "To-do".into(),
        engine_env: "TODO_ENGINE".into(),     // development: TODO_ENGINE="node dist/main.js"
        engine_sibling: "todo-engine".into(), // a packaged app: the engine next to this program
        size: [480.0, 640.0],
    })
}
```

A template, in the vocabulary:

```mprx
<column>
  <heading>Your lists</heading>
  <row>
    <textfield value={entry} placeholder="New list" on.change={setEntry($event)} />
    <button on.click={createList()}>Add list</button>
  </row>
</column>
```

The worked application is [`examples/todo`](https://github.com/ValanceX/Valance/tree/main/examples/todo) in the Valance repository, and the [Learn page](https://github.com/ValanceX/Valance/blob/main/docs/tutorials/03-desktop-application.md) builds it step by step.

## The vocabulary

Seventeen components, in [`vocabulary.json`](./vocabulary.json) (a MESH manifest, so a build can derive what a template may use from it).

| Component | Props (required unless marked) | Events | What it is |
|---|---|---|---|
| `column` | | | Its children, one under the next. |
| `row` | | | Its children side by side, wrapping when the window is narrow. |
| `heading` | | | A title for what follows. |
| `text` | `id` (optional) | | A run of text. Text is text: nothing in it is markup. An `id` lets a control name it as what `describedby` points to. |
| `button` | `disabled`, `label`, `intent` (`neutral`, `primary`, `danger`), `size` (`sm`, `md`, `lg`) (all optional) | `click` | Something to press. Its content is its label. A disabled button reports nothing. `intent` and `size` choose among the theme's variants of it (the style contract); with no theme they change nothing. |
| `checkbox` | `checked`, `label`, `invalid`, `describedby` (optional) | `change` (the new value, true or false) | A box that is ticked or not. The application decides whether it is. `invalid` and `describedby` as for `textfield`. |
| `radiogroup` | `label`, `invalid`, `describedby` (optional) | | A group of radios: choose one of a few. Its children are the options; `label` names the group for assistive technology (the accessibility tree has a radio group). It has no events: its radios raise them. |
| `radio` | `checked`, `value`, `label`, `disabled` (optional) | `select` (the option's `value`) | One option of a `radiogroup`. The application decides which one is selected (`checked`). Choosing an option that is not selected reports `select`; choosing the selected one, or a disabled one, reports nothing. Tab reaches each option; arrow keys are left to the platform. |
| `toggle` | `pressed`, `disabled`, `label` (optional) | `change` | A button that stays pressed. Its content is its text; its name is its `label` or its text. `pressed` is the application's: a click, or Enter or Space, reports `change` with the value the toggle is going to have, and the toggle shows what comes back. It is a button in the accessibility tree with a toggled state (the ARIA `aria-pressed`). |
| `status` | | | A live region: the text inside is a message about what just happened ("Saved."). The accessibility tree has a status node, polite and atomic, which exists even with nothing in it, so a message put into it later is announced (the ARIA `status` role). It has no name of its own. |
| `alert` | | | A live region for a message that cannot wait ("Could not save."): an alert node, assertive and atomic (the ARIA `alert` role). Like `status` it exists before its text does and has no name of its own. |
| `textfield` | `value`, `placeholder`, `label`, `kind`, `invalid`, `describedby` (optional) | `change` (the text), `submit`, `cancel`, `focus`, `blur` | A line of text the person edits. `submit` is Enter: the person is done with what they typed. `cancel` is Escape: they back out of it. `focus` and `blur`: they came into the field, they left it. `kind="password"` masks what is shown; any other kind is plain text. `invalid` outlines it and marks it invalid for assistive technology; `describedby` names the `id` of the text that explains it. |
| `label` | | | A caption and the control it names: the text written directly inside it is the control's visible text and accessible name, and a click on the text does what a click on the control does (a checkbox changes, a radio is chosen, a text field takes the cursor). The first control inside it is the one named; a control with a `label` of its own keeps it. |
| `table` | `label` (optional) | | A static table: rows and columns with header meaning, not a grid (no selection, editing or arrow-key navigation). Its children are `tablehead` and `tablebody`, which hold `tablerow`s. `label` names the table. Drawn as one grid; the accessibility tree has the table with its row and column counts, its rows and its cells. |
| `tablehead`, `tablebody` | | | The header rows and the data rows of a `table`. |
| `tablerow` | | | A row of cells. (Not `row`, which is the layout component.) |
| `columnheader` | `sort` (optional: `ascending`, `descending`, `none` or `other`) | | A header for a column, drawn strong; `sort` says which way the column is sorted, for assistive technology. The table does not sort: the application does. |
| `rowheader`, `cell` | | | A header for a row, and a cell. Their content is inline: text, `strong`, `emphasis`, `code`, `link` and a `button` (a sortable header holds one). |

**`label`** is a control's accessible name, the one a screen reader says: a checkbox has no text of its own and a field's `placeholder` is a hint, not a name, so a template gives them a `label` (the window passes it to the platform's accessibility tree through AccessKit). A button's name is its content unless a `label` says otherwise.

Events: **click** (a button), **change** (the value of a checkbox, a toggle or a text field changed; it carries the new value), **select** (a radio was chosen; it carries its value), **submit** and **cancel** (Enter and Escape in a text field) and **focus** and **blur** (the person came into a text field, or left it). The names are the ones most toolkits already use; [the investigation](https://github.com/ValanceX/Valance/blob/main/docs/explanation/application-model/native-vocabulary.md) has the sources. The **content layer** (`content.json`) is what Markdown produces, named as WAI-ARIA names the same things: `paragraph`, `list` (`ordered`), `listitem`, `code`, `blockquote`, `image` (`src`, `label`), `strong`, `emphasis`, `link` (`href`), and `heading` with its `level`. Its names are WAI-ARIA's (the maintainer's decision, after checking them against the toolkits' sources). An **image** (`src`, `label`) is drawn from a file on the machine when `src` is an absolute path to a PNG, JPEG, GIF, BMP, WebP or SVG file (the engine names the file; the PORT fetches nothing), named for assistive technology by its `label`; anything else (an address on the network, a relative path, a file that is not there) is drawn as its description, `[image: label]`. A link is an address and has no event: activating it reports the address (`link` in the host protocol), and the application decides what it means. Repeating and conditional parts are not components: they are MESH's blocks (`{#each}`, `{#if}`) in the template.

## The theme

The engine can give the window a theme with its first `appearance` message (see [the architecture note](../../docs/explanation/design-records/2026-10-14-port-desktop.md)): resolved values for the seven primitives of the portable core (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`), by mode. The window applies the fill, text color, border, radius, padding, gap, least size and type size of a recipe, with a `button`'s `intent` and `size` and the viewport class; the rest the toolkit draws itself. The theme module is [`theme`](src/theme.rs); the style contract that writes the theme is the Valance repository's `@valancex/style`.

## The contract

| Operation | Here |
|---|---|
| `draw(tree)` | `Port::draw`. Refuses a tree that is not `mesh-render` version 1 (`unsupported-format`). |
| `update(tree)` | `Port::update`. Refuses until something is drawn (`not-drawn`). Parts are matched by `key`. |
| `unmount()` | `Port::unmount`. Safe twice and before a draw; the PORT stays usable. |
| `patch(patches)` | Not supported (it is optional in the contract; `update` of the whole tree is always valid). |
| reports | `Report { handler, payload }`: the tree's handler identifier and the event's payload, nothing else. |

`tests/contract.rs` checks these against real MESH output (captured from the to-do application).

### Driving it from an engine

An engine in another process (the application, in JavaScript) drives the PORT with one JSON object per line: `hello`, `title`, `appearance`, `draw`, `update`, `unmount` and `closeAnswer` in; `event`, `link`, `scheme`, `navigate`, `resize`, `closeRequested` and `close` out. The module `host` is that conversation, and [the architecture note](../../docs/explanation/design-records/2026-10-14-port-desktop.md) specifies it.

## `vlx-window`

A window for any engine, used by `vlx dev` on a desktop project: `cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window`. It runs the command line in `VLX_ENGINE` (split on spaces) and shows what the engine draws; when `VLX_RELOAD` names a file, a change to that file's modification time starts the engine again in the same window (a development server touches it after a rebuild); the window's title is the application's, sent over the protocol.

## Features

`window` (default): the egui window (`view`, `app`). Without it the crate is the PORT's logic and the host protocol: no graphics dependency.

## Stability

Released as 0.1.0, 0.2.0, 0.3.0 and 0.3.1; 0.4.0 is prepared (see the [changelog](../../CHANGELOG.md) and [API stability](../../docs/reference/stability.md)). Before 1.0 a minor version may change the vocabulary, the host protocol or the crate API, only with the change named in its release notes. So far every release has only added.
