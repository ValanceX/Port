# @valancex/port-desktop (crate `valancex-port-desktop`)

The Desktop PORT: it realizes MESH render trees as a native window on Linux, Windows and macOS, and reports what the person does as handler identifiers and payloads. **Version 0.1, unreleased.**

It is a Rust crate, because a native window is Rust's to draw (PORT's rule: an implementation's language follows its target; see the [architecture note](../../docs/architecture/2026-10-14-port-desktop.md)). It takes the same input as [`@valancex/port-web`](../port-web) and keeps the same [PORT contract](../../docs/CONTRACT.md); what differs is the **vocabulary**: a window, columns and rows, text, a heading, a button, a checkbox and a text field, not HTML.

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
<window title="To-do">
  <column>
    <heading>Your lists</heading>
    <row>
      <textfield value={entry} placeholder="New list" on.change={setEntry($event)} />
      <button on.press={createList()}>Add list</button>
    </row>
  </column>
</window>
```

The worked application is [`examples/todo`](https://github.com/ValanceX/Valance/tree/main/examples/todo) in the Valance repository, and the [Learn page](https://github.com/ValanceX/Valance/blob/main/docs/learn/desktop-application.md) builds it step by step.

## The vocabulary

Eight components, in [`vocabulary.json`](./vocabulary.json) (a MESH manifest, so a build can derive what a template may use from it).

| Component | Props (required unless marked) | Events | What it is |
|---|---|---|---|
| `window` | `title` | | The top of a screen. Its title is the window's title. |
| `column` | | | Its children, one under the next. |
| `row` | | | Its children side by side, wrapping when the window is narrow. |
| `heading` | | | A title for what follows. |
| `text` | | | A run of text. Text is text: nothing in it is markup. |
| `button` | `disabled` (optional) | `press` | Something to press. Its content is its label. A disabled button reports nothing. |
| `checkbox` | `checked` | `toggle` | A box that is ticked or not. The application decides whether it is. |
| `textfield` | `value`, `placeholder` (optional) | `change` (the text) | A line of text the person edits. |

Repeating and conditional parts are not components: they are MESH's blocks (`{#each}`, `{#if}`) in the template.

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

An engine in another process (the application, in JavaScript) drives the PORT with one JSON object per line: `hello`, `draw`, `update`, `unmount` and `closeAnswer` in; `event`, `closeRequested` and `close` out. The module `host` is that conversation, and [the architecture note](../../docs/architecture/2026-10-14-port-desktop.md) specifies it.

## Features

`window` (default): the egui window (`view`, `app`). Without it the crate is the PORT's logic and the host protocol: no graphics dependency.

## Stability

Unreleased. The vocabulary, the host protocol and the crate API may change before 0.1 is published.
