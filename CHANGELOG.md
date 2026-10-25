# Changelog

All notable changes to PORT are recorded here. The project follows [Semantic Versioning](https://semver.org). Until 1.0, minor versions may include breaking changes.

## [Unreleased]

### Added

- `@valancex/port-web`: **the native hatch** (Tier 3, **Provisional**, Web only, not in contract version 1; Valance north-star refinements B6). `createWebPort` takes `native`, a callback per component, typed from the new subpath **`@valancex/port-web/native`** (`Native`, `NativeSetup`; types only). It gets each drawn element of that primitive and `{ key }`, nothing that reports or dispatches, and runs once the element is in the document, after `draw`, an insert by `update` or `patch`, and `hydrate`. Its cleanup runs at the end of the call that removes or replaces the element, or of `draw` or `unmount`, after focus has been handed off. The server takes no `native`. At the end of every `update` and `patch` the PORT writes back every slot it owns on a hatched element. A primitive marked **`opaque: true`** has no tree children (refused with the new code **`opaque-children`**); the server writes it empty and hydration leaves its content unverified. A layer can't be opaque, and a `native` entry must be a function for a primitive of the table (both `invalid-primitives`). See the package README, "Leaving the portable layer".
- Scorecard audits touched (Valance `docs/NORTH_STAR_SCORECARD.md`): **H1** (a documented way down to the platform) F at the 2026-10-19 baseline (partial hatches documented by A10) → P: the hatch exists and is documented; **H2** (the hatch cannot corrupt framework state) – → P: it is imported from its own subpath, gets no report or dispatch, and the PORT re-asserts what it owns (tested).

## [0.14.0] - 2026-10-24 (prepared, not yet released; the crate stays 0.6.0)

A minor release of the two npm packages, which share one version: **the MESH runtime peer range of `@valancex/port-web` admits 0.17** (`^0.6.0 || … || ^0.16.0 || ^0.17.0`), so the newest set installs together once MESH 0.17 is published. No API or behavior change; the Web PORT's 435 tests were run against MESH 0.17.0 (`scripts/check-mesh-range.mjs` now installs from `MESH_PACK_DIR` for a version that is not published yet). See the [v0.14 release notes](./docs/releases/v0.14.md).

## [0.13.0] - 2026-10-24 (prepared, not yet released; the crate stays 0.6.0)

A minor release of the two npm packages, which share one version: **the MESH runtime peer range of `@valancex/port-web` admits 0.16** (`^0.6.0 || … || ^0.15.0 || ^0.16.0`). MESH 0.16 is published and 0.12's range stopped at 0.15, so the newest published set did not install together (the budgets' installability check, Valance Bet 3). No API or behavior change. The line was run, not only listed: `scripts/check-mesh-range.mjs 0.16.0` ran the Web PORT's 435 tests against MESH 0.16.0 with the 0.16 conformance vectors. See the [v0.13 release notes](./docs/releases/v0.13.md).

## [0.12.0] - 2026-10-23 (prepared, not yet released; the crate is 0.6.0, tag `desktop-v0.6.0`)

A minor release of the two npm packages and of the Desktop PORT crate: **layers (WP6b of the Valance direction work)**: a modal dialog and a popover on both targets. Additive: nothing an application wrote before changes. See the [v0.12 release notes](./docs/releases/v0.12.md).

### Added

- `@valancex/port-web`: **`WebPrimitive.layer`** (`"modal"` or `"popover"`), with the prop kind **`layerProp("open" | "anchor" | "placement")`** and the event realization **`layerDismiss`** (`raised: true`: the PORT raises it, the platform does not). A modal layer is a `<dialog>` shown with `showModal()`: server HTML writes `open` (it paints before any script), hydration upgrades it to modal, focus stays inside (Tab and Shift+Tab wrap, decision I20), the page behind is inert, and focus returns to the invoker (by key; else the layer's parent) when it closes. A popover is an element with the `popover` attribute shown with `showPopover()`, placed at its anchor by CSS anchor positioning where the browser has it. Escape and an outside press report a `close` the application may refuse: a layer the browser closes against the app's `open` is reopened.
- `@valancex/port-web`: table checks for layers (one `open` role, `modal` only on `<dialog>`, no anchor or placement on a modal, a `raised` event only on a layer), and **`nested-modal`**: a modal layer inside another is refused by `draw`, `update`, `patch`, `hydrate` and `realizeHtml`.
- `@valancex/port-web`: the Authoring Practices' modal dialog rows, quoted into `overlays/apg-dialog-modal.source.json` and generated into 33 vectors (`overlays/dialog-modal.vectors.json`), run in Chromium; and a subset of the web-platform-tests for the dialog and popover elements and for focus, run in Chromium at a pinned commit (`integration/wpt`, `pnpm --filter integration test:wpt`), with its seven expected failures named.
- `@valancex/port-desktop-vocabulary`: **`dialog`** (`open`, `label`; the event `dismiss`) and **`popover`** (`open`, `anchor`, `placement`, `mode`; the event `dismiss`), and `button` takes **`id`** (what a popover's `anchor` names). Twenty-two components, an eighth event verb.
- `valancex-port-desktop` 0.6.0: a **dialog** is egui's `Modal` (the backdrop blocks the pointer, focus is limited to the modal layer) with initial focus, Tab and Shift+Tab wrap, Escape, and focus return to the invoker; a **popover** is an `Area` at its anchor's rect (`auto` closes on an outside press or Escape, `manual` never). A dialog inside a dialog is refused by `draw` and `update` (`PortError::NestedModal`). A radio group's radios are children of its node in the accessibility tree, and an inline link has an id made from its key (decision I21). A themed `button` is `hovered` and `pressed` for the theme's state rules (decision I22).
- `valancex-port-desktop`: tests read the accessibility tree with AccessKit's own consumer (`accesskit_consumer`) for the radio group's and the modal's keys.

## [0.11.0] - 2026-10-23 (prepared, not yet released; the crate is 0.5.0, tag `desktop-v0.5.0`)

A minor release of the two npm packages and of the Desktop PORT crate: **PORT behavior (WP6 of the Valance direction work)**. Additive: nothing an application wrote before changes, except where noted. See the [v0.11 release notes](./docs/releases/v0.11.md).

### Added

- `@valancex/port-web`: **focus follows identity** (I2, I12). After every `draw`, `update` and `patch`, focus and a text field's selection (with its direction) stay with the part they were in, by key; a part that is gone hands focus to what follows it, then what precedes it, then what holds it. The focus and blur events of the PORT's own restoring are not reported.
- `@valancex/port-web`: **`focus(key)`** (I13), the host's request, a call after the patches, not a command: focuses the part or the first thing in it that takes focus, and says whether it did.
- `@valancex/port-web`: **`WebPrimitive.group`**: the DOM's own grouping. A radio carries `name` made from its radiogroup's key (the key in server HTML, verified by hydration; the mount's own in the browser for every port after a document's first), so a group is one tab stop with the arrow keys, and two groups or two mounts never share one.
- `@valancex/port-web`: **`elementWhen(name)`**, a prop kind that chooses the element: `true` makes it `name` (a list's `ordered` makes `ol`). Server HTML has the chosen tag, hydration verifies it, and when the prop changes the PORT replaces the element, which takes the old one's children (each keeps its DOM node), props and place.
- `valancex-port-desktop` 0.5.0: **widget ids come from node keys** (I16). A component node is drawn in a `Ui` made from the parent's id and its key (egui seeds a child's automatic ids from its parent's counter, so `push_id` is not enough). All 19 identity vectors and the 4 program step transitions that moved an accessibility node now keep it; focus stays with a field when fields change places; list items, table rows and cells are named by their keys. The spike (a scroll position, an open section) is in `view.rs`.
- `valancex-port-desktop`: **focus follows identity** (a field, button, toggle, checkbox or radio that leaves the tree hands focus to its heir), the host protocol's **`focus` message** (additive: protocol 1; an older window ignores it), and `Port::focus`.
- `valancex-port-desktop`: **roving focus in a radio group** (the APG radio group keys): one tab stop (the checked radio, else the first), the arrows move focus and choose, wrapping, Tab and Shift+Tab leave. The radio is drawn as egui's own with the group's sense, because egui's cannot skip Tab.

### Changed

- `@valancex/port-web`'s peer range admits MESH 0.15 (each line run), and `@valancex/mesh-conformance` is `^0.15.0`.
- `valancex-port-desktop`'s tests: `identity_is_not_kept_by_key` and `program_steps_do_not_keep_identity_by_key` (which listed the failures exactly) are `identity_is_kept_by_key` and `program_steps_keep_identity_by_key`, with a control that tells a key from a place.
- The Desktop theme fixture is the default theme with `text` reserving a line (`min-size`).


### Added

- **A theme for the window.** The host protocol's `appearance` message takes an optional `theme`: resolved values (colors, lengths in points) for the seven primitives of the portable core, by mode, sent once and kept (additive: protocol 1, no new number). The window applies a recipe's fill, text color, border, radius, padding, gap, least size and type size, a `button`'s `intent` and `size`, the `invalid` state and the viewport class, in the toolkit's light or dark mode; what it cannot apply (elevation, opacity, outline, hover, press and focus styles) is not sent. A theme it cannot read is reported on stderr and the window keeps its own look. `valancex-port-desktop`: `theme` module, `Session::theme`, `View::set_theme`; tests `theme.rs` (the wire contract, with the default theme as a fixture) and `themed.rs` (the toolkit's shapes and layout read back).
- `@valancex/port-desktop-vocabulary`: `button` takes `intent` (`neutral`, `primary`, `danger`) and `size` (`sm`, `md`, `lg`), both optional. Without a theme they change nothing.

## [0.10.0] - 2026-10-18 (prepared, not yet released; the crate is 0.4.0, tag `desktop-v0.4.0`)

A minor release of the two npm packages that share one version, and of the Desktop PORT crate. **`@valancex/port-desktop-vocabulary` grows to twenty components**, additively: nothing an application wrote before changes. **`@valancex/port-web`'s peer range now admits MESH 0.13 and 0.14.** See the [v0.10 release notes](./docs/releases/v0.10.md).

### Added

- `@valancex/port-desktop-vocabulary` 0.10.0, `vocabulary.json`: **`status` and `alert`**, the live regions (decision A13), and **`toggle`**, a button that stays pressed (`pressed`, `label`, `disabled`; the event `change` carries the value it is going to have). Twenty components.
- `valancex-port-desktop` 0.4.0 draws them. `status` is a Status node (polite, atomic) and `alert` an Alert node (assertive, atomic), each present before it has text (the APG alert pattern); `toggle` is a Button whose pressed state is the tree's toggled state, and a click, or Enter or Space, reports `change` with the new value. Checked in `tests/spec_invariants.rs` and `tests/toggle.rs`.
- The Web PORT runs MESH's 22 node-identity vectors (C1 to C22) in `identity-conformance.test.ts`: all pass.
- The Desktop PORT reads the vectors where it can (`tests/conformance.rs`): every tree is accepted, the text-run case is readable, and the identity vectors run against a keyed update that the Desktop does not have yet: 14 of 19 change a kept identity's accessibility node (egui's widget ids follow position). Listed exactly in the test.
- `scripts/check-mesh-range.mjs` runs the Web PORT's suite against each MESH minor its peer range lists (0.6 to 0.14: all pass), and CI runs it (`mesh-range`).

### Changed

- **`@valancex/port-web`'s peer range admits `@valancex/mesh-runtime` 0.13 and 0.14** (`^0.6.0 || ... || ^0.14.0`). Each line was run, not only listed: the suite passes against 0.6 through 0.14 with the vectors of the newest conformance package; the program vectors, which use constructs MESH 0.14 introduced, run from 0.14. The 0.12 lines before this were listed without being run.
- **The program vectors of MESH 0.14 are run** (`enums/`, `snippets/`, `forwarder/`, `passing/`). The Web PORT draws every step's committed tree and updates between them (kept keys are the same DOM node, gone keys are disposed, the order is the tree's, handler identifiers are reported) and checks the key cases: 23 tests, all pass. The Desktop PORT takes every tree and is held to the same law: four step transitions (reorders and removals in a repeat) change a widget's accessibility node, listed exactly in `tests/conformance.rs`. `conformance.json` supports 0.14.0. Not renderer vectors, and so not run: the `enums/` cases `rejects` (MESH refuses the snapshot, there is no tree) and `dispatches` (MESH resolves an intent).
- **MESH's conformance vectors are consumed from `@valancex/mesh-conformance`, not copied, and from the registry (`^0.14.0`), not a git pin.** `fixtures/mesh-conformance/` (a verbatim copy at MESH v0.6 that lacked the identity vectors) is deleted. `scripts/check-conformance.mjs` fails on a copy anywhere in the tree or an installed package older than `conformance.json`'s `supports`.

### Fixed

- `valancex-port-desktop`: `blockquote` is exposed as `Role::Blockquote` (decision A11, 23 names), and the bullet or number of a list item is hidden from assistive technology instead of read as the item's first content. Both are checked in `tests/spec_invariants.rs`.
- `valancex-port-desktop`: the accessibility tree now says what a heading, a paragraph and a list are. egui draws these as labels and never emits their roles, so a screen reader was told "label" for a `heading` (with no level) and nothing for `list` and `listitem`. The PORT now sets `Heading` with its `level` (its text, drawn inside it, is its name), `Paragraph`, `List` and `ListItem` (with its position in the list and the list's size), and the items are children of the list. `blockquote` followed in the entry above (it joined the version-1 role set). Pinned by `tests/spec_invariants.rs`, a checker of the update against AccessKit's invariants and the role and name rules (decision A11).

## [0.3.1] - 2026-10-17 (`valancex-port-desktop`, tag `desktop-v0.3.1`)

A patch release of the Desktop PORT crate, on its own tag: a fix, and no change to the vocabulary, the host protocol or the crate's API. The npm packages are unchanged (they stay at 0.9.0). See the [v0.9 release notes](./docs/releases/v0.9.md#desktop-031).

### Fixed

- `valancex-port-desktop`: a table's cells no longer wrap their text. Inside the grid a wrapping layout was given the column's width from before the cell was drawn, so a header word broke in two ("Orde" / "r") in a real window. Found by driving 0.3.0's table in a window; the headless tests could not see it.

## [0.9.0] - 2026-10-17

A minor release of the two npm packages that share one version. **`@valancex/port-web` changes nothing** (it moves so the workspace has one version). **The Desktop PORT's vocabulary grows by seven components**, additively: nothing an application wrote before changes. See the [v0.9 release notes](./docs/releases/v0.9.md).

### Added

- `@valancex/port-desktop-vocabulary` 0.9.0, `vocabulary.json`: a **static table**, seven components (`docs/application-model/TABLE.md` in the Valance repository, RF-12). `table` (`label`) holds `tablehead` and `tablebody`, which hold `tablerow`s of `columnheader` (`sort`: `ascending`, `descending`, `none` or `other`), `rowheader` and `cell`. No events. The vocabulary is seventeen components.

## [0.3.0] - 2026-10-17 (`valancex-port-desktop`, tag `desktop-v0.3.0`)

A minor release of the Desktop PORT crate, on its own tag. Additive: a tree that drew in 0.2.0 draws the same.

### Added

- `valancex-port-desktop`: draws the table as one grid, the header rows strong and each cell's content inline, and sets what the toolkit's grid does not: in the accessibility tree a `Table` (with its name and row and column counts), `Row`s (with their index), and `Cell`, `ColumnHeader` and `RowHeader` (with their row and column indices; `sort` becomes the sort direction). Headless tests read the tree back.

## [0.8.0] - 2026-10-16

A minor release of the two npm packages that share one version. **`@valancex/port-web` changes nothing** (it moves so the workspace has one version). **The Desktop PORT's vocabulary grows by one component**, additively: nothing an application wrote before changes. See the [v0.8 release notes](./docs/releases/v0.8.md).

### Added

- `@valancex/port-desktop-vocabulary` 0.8.0, `vocabulary.json`: **`label`**, a component that holds a control and the text that names it (`docs/application-model/CHOICE-GROUP.md` in the Valance repository, WA-14). It has no props and no events: the text written directly inside it is the control's visible text and accessible name, and the first control inside it is the one it names. The vocabulary is ten components.

## [0.2.0] - 2026-10-17 (`valancex-port-desktop`, tag `desktop-v0.2.0`)

A minor release of the Desktop PORT crate, on its own tag. Additive: a tree that drew in 0.1.0 draws the same.

### Added

- `valancex-port-desktop`: draws `label`. A `checkbox` or `radio` inside takes the text as the text beside the box; a `textfield` has it drawn before the field, and a click on the text puts the cursor in the field. A control that has its own `label` keeps it. The text is the control's name in the accessibility tree. Headless tests click the text and read the tree back.

## [0.7.1] - 2026-10-16

A patch release that **completes v0.7.0**. The v0.7.0 tag published `@valancex/port-web` 0.7.0, and the publish of `@valancex/port-desktop-vocabulary` 0.7.0 was refused because its npm trusted publisher was not yet set; the release did not finish, and npm does not reuse a version. The two packages move together to 0.7.1 so that both are published by the workflow. **No code changes**: `@valancex/port-web` 0.7.1 is 0.7.0, and `@valancex/port-desktop-vocabulary` 0.7.1 carries everything v0.7.0 described below. There is no `@valancex/port-desktop-vocabulary` 0.7.0. See the [v0.7 release notes](./docs/releases/v0.7.md#v071).

## [0.7.0] - 2026-10-16

A minor release of the two packages that share one version, `@valancex/port-web` and `@valancex/port-desktop-vocabulary`. **`@valancex/port-web` changes nothing** (it moves so the workspace has one version, as at 0.6.0). **The Desktop PORT's vocabulary grows**, additively: nothing an application wrote before changes. See the [v0.7 release notes](./docs/releases/v0.7.md). The crate `valancex-port-desktop` is released on its own tag; its first release, 0.1.0, carries the same additions.

### Added

- `@valancex/port-desktop-vocabulary` 0.7.0, `vocabulary.json`: **form primitives**, the same names and types the Web PORT's tag table carries for a Valance application (`docs/application-model/FORM-PRIMITIVES.md` in the Valance repository), all optional. `textfield` takes `kind` (`password` masks what is shown); `textfield` and `checkbox` take `invalid` and `describedby`; `text` takes `id`; `textfield` raises `focus` and `blur`.
- `@valancex/port-desktop-vocabulary` 0.7.0, `vocabulary.json`: a **choice group**, two components (`docs/application-model/CHOICE-GROUP.md`). `radiogroup` (`label`, `invalid`, `describedby`, no events) holds the options; `radio` (`checked`, `value` required; `label`, `disabled`) raises `select` with its `value`. The vocabulary is nine components and seven event verbs (`click`, `change`, `submit`, `cancel`, `focus`, `blur`, `select`).
- `@valancex/port-desktop-vocabulary` 0.7.0, `content.json`: `paragraph` takes an optional `id`.

## [0.1.0] - 2026-10-15 (`valancex-port-desktop`, tag `desktop-v0.1.0`)

The first release of the Desktop PORT, the Rust crate (and the `vlx-window` program) that draws a Valance application in a native window. It is versioned and released on its own tag, apart from the npm packages. Built and tested on Linux and Windows; macOS is not built or tested. Unsigned. See the [architecture note](./docs/architecture/2026-10-14-port-desktop.md) and [API stability](./docs/stability.md).

### Added

- `valancex-port-desktop`: **form primitives**. `textfield` takes `kind` (`password` masks what is shown; every other kind, known or not, is plain text), `invalid` (outlined, and invalid in the accessibility tree) and `describedby` (the `id` of the text that explains the control, its accessible description); `checkbox` takes `invalid` and `describedby`; `text` and `paragraph` take `id`; `textfield` raises `focus` (the person came into the field) and `blur` (they left it, also after `submit` or `cancel`). Headless tests read the accessibility tree back.
- `valancex-port-desktop`: a **choice group**, `radiogroup` and `radio`. The group is named for assistive technology by its `label` and is a radio group in the accessibility tree; a radio raises `select` with its `value` when chosen, and reports nothing for the selected one or a disabled one. Movement among the options is the platform's: Tab reaches each, and the window adds no arrow-key handling.
- `valancex-port-desktop`: the host message `resize` (`{ "op": "resize", "width": 812 }`), the width of the window's content in whole points, sent when the window opens and whenever it changes, so the application learns how much room it has (`viewport`) as it does on the web. An engine that does not know the message ignores it.
- `valancex-port-desktop`: **keys, only the ones a platform has a convention for.** Escape in a text field is a new event, `cancel` (beside `click`, `change` and `submit`). Alt+Left and Alt+Right, and the mouse's back and forward buttons, are a new host message, `navigate` (`back` or `forward`), for an engine that keeps a list of pages; on macOS the keys are unmapped (the mouse buttons stay). See "Keys" in the [architecture note](./docs/architecture/2026-10-14-port-desktop.md).
- `valancex-port-desktop`: the window can start its engine again in place (`Engine::restart`), triggered by a change to the file `VLX_RELOAD` names, so a development server can rebuild without closing and reopening the window.
- `valancex-port-desktop`: `submit`, an event of `textfield` (the person pressed Enter in it). A headless test clicks into the field and presses keys.
- `valancex-port-desktop`: color scheme. The window tells the engine the system's colors (`scheme`, when it opens and when they change), and the engine may ask the window to look `light`, `dark` or `system` (`appearance`); the window follows the system when it asks for nothing.
- `valancex-port-desktop`: images. An `image` whose `src` is an absolute path to a PNG, JPEG, GIF, BMP, WebP or SVG file is decoded and drawn, with its `label` as its accessible name; anything else is drawn as its description. The PORT fetches nothing.
- `valancex-port-desktop`: an optional `label` on `button`, `checkbox` and `textfield`, the control's accessible name, passed to the platform's accessibility tree (AccessKit, now enabled in the window). A test draws a tree with no window and reads the names back.
- `vlx-window` (a binary of `valancex-port-desktop`): a window for any engine, for `vlx dev`.
- The content layer of `valancex-port-desktop` (`content.json`: `paragraph`, `list`, `listitem`, `code`, `blockquote`, `image`, `strong`, `emphasis`, `link`, and `heading` with a `level`), named as WAI-ARIA names them, drawn from real MESH output, with links reported as addresses (`link` in the host protocol).
- `valancex-port-desktop` 0.1.0 (unreleased): the Desktop PORT. A Rust crate that realizes `render-v1` as a native window (egui) and reports interactions as handler identifiers and payloads. A vocabulary of nine components (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`, `radiogroup`, `radio`) in `vocabulary.json`, with two events (`click`, `change`); the host protocol for an engine in another process; contract tests on real MESH output. See the [architecture note](./docs/architecture/2026-10-14-port-desktop.md).

## [0.6.1] - 2026-10-15

A patch release of `@valancex/port-web` (and `@valancex/port-desktop-vocabulary`, which moves with it). See the [v0.6 release notes](./docs/releases/v0.6.md#v061).

### Fixed

- `@valancex/port-web`: **two events of one primitive may share a DOM event type when they are made by different keys.** A text field can now realize `submit` (`{ type: "keydown", key: "Enter" }`) and `cancel` (`{ type: "keydown", key: "Escape" }`) together. Before, the table was refused as "one interaction would have two applicable events" although no key press can be both. A table is still refused when two events share a type and the same key, or when either of them takes any key (an event with no `key`). Resolution is unchanged for every table that was accepted before.

## [0.6.0] - 2026-10-15

A minor release. **The Desktop PORT's vocabulary is published as data**, so the tools that check a template (`vlx check`, editors) read it from a package instead of carrying a copy that can drift. `@valancex/port-web` changes nothing: the two packages share one version and are published together. See the [v0.6 release notes](./docs/releases/v0.6.md).

### Added

- `@valancex/port-desktop-vocabulary` 0.6.0: `vocabulary.json` (the components a template may write for a native window, with props and events, including the new `cancel`) and `content.json` (the content layer), copied from the Rust crate's files before every pack and test, with a test that they are byte for byte the crate's. The release workflow packs and publishes both packages and checks they share one version.

### Changed

- `@valancex/port-web` 0.6.0: no change to its API or behavior (the version moves with the package above).

## [0.5.0] - 2026-10-14

A minor release of `@valancex/port-web`: **what a primitive always is, a flag the user changes, and an event made by one key.** Additive: nothing existing changes. Found by building one application for the web and for a native window. See the [v0.5 release notes](./docs/releases/v0.5.md).

### Added

- `@valancex/port-web`: an event can be realized by one key (`{ type: "keydown", key: "Enter" }`): any other key is not that event, and the interaction goes on toward the root. Additive.
- `@valancex/port-web`: **constant attributes** (`attributes` on a primitive: `{ element: "input", attributes: { type: "checkbox" } }`), written on every draw and server render and verified by hydration; and **`controlledBoolean(name)`**, a boolean slot that is both the boolean attribute and the DOM property (a checkbox's `checked`), so a ticked checkbox has an HTML form and is reasserted after every presentation. Both additive; found by building one application for the web and a window.

## [0.4.2] - 2026-10-13

A patch release: the MESH runtime peer range accepts 0.11 and 0.12. See the [v0.4 release notes](./docs/releases/v0.4.md#v042).

### Changed

- `@valancex/port-web` accepts MESH runtime 0.11 and 0.12 (`^0.11.0 || ^0.12.0` join the peer range). MESH 0.11 writes conditional and repeated content as blocks (`{#if}`, `{#each}`) and retires the `mesh-if`, `mesh-each` and `mesh-switch` elements; PORT is unaffected, because it only ever saw the keyed tree a runtime renders. The MESH integration test now uses blocks.

## [0.4.1] - 2026-10-10

A patch release: **a URL attribute never holds code.** Found by validating the released 0.4.0 against the API design principles (§11 secure defaults). See the [v0.4 release notes](./docs/releases/v0.4.md).

### Fixed

- An `attribute` realization of a URL attribute (`href`, `src`, `action`, `formaction`, `poster`, `cite`, `background`, `ping`, `manifest`, `codebase`, `longdesc`, `usemap`) given a `javascript:` or `vbscript:` URL is refused as `unrealizable-value`, and so is a `data:` URL in `href`, `action`, `formaction` or `cite` (a `data:` image in `src` is allowed). Before, `<a href="javascript:alert(1)">` was written as given, so data a consumer did not write could run script on a click. The browser's own scheme reading is followed (leading controls and spaces ignored, tab and newlines dropped, case ignored). Draw, update, hydrate, `patch` and the server's HTML refuse by the one rule, before any DOM is touched. Relative URLs, `http`, `https`, `mailto`, `tel` and every non-URL attribute are unchanged.

## [0.4.0] - 2026-10-10

A minor release: **`@valancex/port-web` gains `patch`, and a presentation can end with `unmount` safely.** Nothing existing changes. See the [v0.4 release notes](./docs/releases/v0.4.md).

### Added

- **`unmount()` is documented as safe to call twice and before any `draw`**, leaving the PORT usable (`draw` draws again; `update` and `patch` refuse with `not-drawn`), and the Web PORT has `[Symbol.dispose]()` where the platform has it, the same as `unmount()`, so `using port = createWebPort(...)` unmounts at the end of a block.
- **`patch(patches)`** on the Web PORT: applies a MESH `render-patch-v1` list in place. `setProp`, `removeProp` and `setText` change a kept part; `insert`, `remove` and `move` add, take away and reorder parts by key, so a moved part keeps its DOM node and its state and a removed one is disposed; `replace` is a `draw`. The result is what `update` of the full new tree gives. The whole list is checked before the DOM is touched, each operation against the effect of the ones before it (`unknown-key`, `duplicate-key`, `unsupported-patch`, `unrealized-prop`, `unrealizable-value`, `missing-prop-text`); an operation it doesn't know is refused, never skipped. If a DOM setter then throws, it throws `patch-failed` (the earlier steps stay applied, and the composer recovers with `draw`). The `RenderPatches` and `RenderPatch` types are PORT's own, so it needs no unreleased MESH package. It is checked against hand-written lists, with the DOM compared to `update`'s, and end to end against the real MESH runtime's patches over 4,000 random updates (a script, not yet in `integration/`, which runs against published packages).
- A key index, so a patch finds its target by key without walking the tree. It is kept in step by `draw`, `update`, `hydrate` and `unmount`.

### Compatibility

- **API, entries and options:** additive for code that calls the Web PORT. `WebPort` gained `patch`, `inspect` and `[Symbol.dispose]`, so code that implements it (a wrapper typed as `WebPort`) must add them or be typed as the smaller contract it needs. `patch` and the types `RenderPatch` and `RenderPatches` are new; `inspect` is a devtools hook and not part of the contract; every existing realization, table and behavior is unchanged.
- **MESH:** 0.6 to 0.10. `patch` applies the `render-patch-v1` documents that MESH 0.10's `update` and `updateChanges` return; on an older MESH the Web PORT is used with `draw` and `update` as before.

## [0.3.0] - 2026-10-05

A minor release: **one realization is added to `@valancex/port-web`'s API; nothing existing changes.** See the [v0.3 release notes](./docs/releases/v0.3.md).

### Added

- **`controlled(name)`**, a text-slot realization for a field the user edits (an input's `value`): the content attribute **and** the same-named DOM property. It has an HTML form (it serializes, verifies and hydrates as `attribute`), and after every `draw`, `update` and `hydrate` the DOM property equals the rendered text, written only when it differs and keeping a focused field's selection. Until now the only server-renderable form of `value`, `attribute`, stopped affecting a field once the user had typed in it, and `textProperty` could not be server-rendered and was diffed against the previous render rather than the DOM, so an application that reset or declined an edit could leave the field showing text its state did not hold. The edit an application declines by committing nothing is reasserted by the next presentation, not before (documented and tested). Additive: `attribute`, `textProperty` and every existing table behave as before.

### Compatibility

- **API, entries and options:** additive. `controlled` is exported from `@valancex/port-web` and `@valancex/port-web/server`; every existing realization, table and behavior is unchanged.
- **MESH:** 0.6, 0.7, 0.8 and 0.9, as in 0.2.4.

## [0.2.4] - 2026-10-05

A compatibility release: **`@valancex/port-web`'s source, API and behavior are unchanged.** See the [v0.2 release notes](./docs/releases/v0.2.md#v024).

### Changed

- **`@valancex/port-web`'s peer dependency on `@valancex/mesh-runtime` is `^0.6.0 || ^0.7.0 || ^0.8.0 || ^0.9.0`** (was `^0.6.0 || ^0.7.0 || ^0.8.0`, which excludes 0.9). Source, API and behavior are unchanged: the package only imports MESH's types and treats a render-v1 key as opaque, and MESH 0.9 adds only the compiler's `compileProgram` and changes neither `render-v1` nor `template-v1`. The package's 258 tests, typecheck and build pass against the 0.9.0 runtime and compiler, and `integration/test/mesh-dynamic.test.ts` passes (13 tests) against a MESH 0.9.0 build. Without the new range a project on MESH 0.9 gets an unmet-peer warning (an error under npm).

### Compatibility

- **API, entries and options:** unchanged from 0.2.3.
- **MESH:** 0.6, 0.7, 0.8 and 0.9. The minimum supported version is unchanged.

## [0.2.3] - 2026-10-04

A compatibility release: **`@valancex/port-web`'s source, API and behavior are unchanged.** See the [v0.2 release notes](./docs/releases/v0.2.md#v023).

### Changed

- **`@valancex/port-web`'s peer dependency on `@valancex/mesh-runtime` is `^0.6.0 || ^0.7.0 || ^0.8.0`** (was `^0.6.0 || ^0.7.0`, which excludes 0.8). The package only imports MESH's types and treats a render-v1 key as opaque; MESH 0.8 adds an operation (`declaredEvents`) and changes neither `render-v1` nor `template-v1`. Without the new range, a project on MESH 0.8 gets a peer-dependency conflict.

### Compatibility

- **API, entries and options:** unchanged from 0.2.2.
- **MESH:** 0.6, 0.7 and 0.8. The minimum supported version is unchanged.


## [0.2.2] - 2026-10-02

A patch release: **`@valancex/port-web`'s API is unchanged**, and `update` now does what the contract has always said it does. See the [v0.2 release notes](./docs/releases/v0.2.md#v022).

### Fixed

- **`update` matched children by position, not by key.** The contract says the target object for each key present in both trees is kept, but a child whose key differed from the one at its index was replaced and every later child with it, so an insertion before a node recreated that node and a reorder recreated all of them. Children are now matched by key, recursively: a key in both trees keeps its object (moved in the DOM only if out of place), a new key is created, a removed key is disposed, and a key that leaves and returns is a new object. No MESH, NEXUS or schema change; draw, hydrate and the static-program behavior are unchanged.

### Added

- **Realization compatibility** in the contract: a realization is retained only when the key and the component are compatible; a key whose component changes is replaced. PORT's own safety rule, not a MESH identity rule.
- **An integration tracer for MESH dynamic structure** (`integration/test/mesh-dynamic.test.ts`): real MESH output (the provisional `mesh-if` and `mesh-each`, from a MESH checkout's build, found at `MESH_CHECKOUT` or `../Mesh`; skipped without one) reconciled by PORT, asserting target-object identity for reorder, insert, remove, reappearance, conditional switching, and handlers. PORT's dependency on MESH 0.6.0 is unchanged.

### Changed

- **`@valancex/port-web`'s peer dependency on `@valancex/mesh-runtime` is `^0.6.0 || ^0.7.0`** (was `^0.6.0`, which excludes 0.7). The package only imports MESH's types; it still treats a render-v1 key as an opaque string and gains no dependency.

### Compatibility

- **API, entries and options:** unchanged from 0.2.1.
- **Static programs:** identical behavior. Every tree of a static program has the same keys in the same order, so key matching and position matching agree.
- **Programs whose structure varies** (MESH 0.7's provisional `mesh-if` and `mesh-each`): from 0.2.2 `update` keeps each key's DOM node across insertion, removal and reordering. Before it, an insertion recreated the nodes after it and a reorder recreated every moved node, and their state (focus, scroll, input) was lost.
- **Hydration** is unchanged, and not tested with conditional or repeated structure.

## [0.2.1] - 2026-09-28

A patch release. `@valancex/port-web`'s source, API and behavior are unchanged from 0.2.0. Everything else is in the private integration workspace. See the [v0.2 release notes](./docs/releases/v0.2.md#v021).

### Added

- **The Chromium tracer bullet** (`integration/browser/`), run by `pnpm --filter @valancex/port-integration run test:browser` and by a new CI job. It is the smallest real composition, in a real browser:
  - MPRX, compiled in Node by the published MESH compiler;
  - `@valancex/mesh-runtime`, `init`ed in the page;
  - a NEXUS application whose `users.refresh` requires one capability;
  - a test-local platform in the `Layer.merge` shape, providing that capability and Clock 42;
  - the existing composer, `@valancex/port-web` and Chromium, with real clicks.

  It checks:
  - MESH's reviewed intent, capability resolution, and an in-place DOM update;
  - that application code sees the platform's Clock, and the caller, which gets its events with the ordinary `Fiber.join`, never does (NEXUS v0.9's caller isolation);
  - the negative path: with the capability absent, the analysis says incompatible, the application still starts, Refresh fails with `CapabilityUnavailableError`, and nothing else changes.

  It runs with Vitest browser mode (`@vitest/browser` 3.2.7) and Playwright 1.56.1 (Chromium 1194).

### Changed

- **Integration on NEXUS 0.9.** The integration workspace uses `@valancex/nexus` `^0.9.0`, which isolates an application's platform FiberRefs from its caller, and declares `@valancex/mesh-runtime` `^0.6.0` itself.
- **The temporary MESH runtime override is removed.** The workspace root's `pnpm.overrides` entry `"@valancex/nexus>@valancex/mesh-runtime": "^0.6.0"`, added in 0.2.0 only because NEXUS 0.8.0 declared `^0.5.0`, is gone.
- The workspace still resolves one copy of `@valancex/mesh-runtime` (0.6.0) and of `effect`.

### Compatibility

- **`@valancex/port-web`:** unchanged: the same entries, API, peer dependency (`@valancex/mesh-runtime` `^0.6.0`) and behavior as 0.2.0.
- **MESH:** v0.6, unchanged.
- **NEXUS:** integration-tested with `@valancex/nexus` 0.9.0, through the composer only. PORT doesn't depend on NEXUS.

## [0.2.0] - 2026-09-28

The Web PORT on MESH v0.6, with server rendering and hydration for a deliberately narrow subset. See the [v0.2 release notes](./docs/releases/v0.2.md) for an overview.

### Included

- **MESH v0.6 render-v1 realization.** `@valancex/port-web` draws and updates render-v1 trees, keeping each key's DOM node across `update`. The composer, not PORT, decides program continuity and keeps the drawn `Render`.
- **Explicit native and text value realization** (MESH §9.8.7). Each prop goes to a slot the realization table names:
  - **native:** `property(name, "boolean" | "number" | "value")` or `booleanAttribute(name)`, which take only a value of their own kind;
  - **text-only:** `attribute(name)` or `textProperty(name)`, which take a string's own value or MESH's `propText`.

  A list or record in a text-only slot is refused. PORT makes no text of a value. A DOM property and an HTML attribute are different slots and never substitute for each other.
- **MESH event resolution** (§9.9). One interaction, one DOM event reaching the container, resolves to at most one binding: the innermost node, from the target towards the root, whose primitive has an applicable event and binds it. DOM bubbling decides nothing, and PORT adds no propagation semantics of its own.
- **Shared, DOM-free checking.** The realization table is validated once, identically on client and server:
  - one realization per source prop, of a known kind (duplicate keys can't be written in an object literal, TS1117; getter-based or malformed entries are refused);
  - unique attribute and property names, with `data-component` reserved;
  - names the DOM and HTML both give back unchanged;
  - one event per DOM event type per primitive.

  Every tree is checked in full before anything is written.
- **Deterministic SSR HTML serialization.** `realizeHtml(tree, primitives)` in `@valancex/port-web/server` places the same realized outputs as the DOM path, with parse-verified escaping and attributes in name order. It returns complete HTML or throws, and never outputs keys, handler identifiers or program identity. The entry is DOM-free, and its module graph excludes the DOM realization.
- **Structural hydration.** `WebPort.hydrate(tree)` pairs the client's tree with the server DOM by position. It verifies every element, namespace, exact attribute set, text and child count without changing the DOM, then adopts it, keeping every server node. It is Web-specific, not a PORT contract operation.
- **Complete mismatch fallback.** The first mismatch in document order makes `hydrate` draw the whole tree afresh, and report the mismatch. No server node is reused, and `update` follows as after any `draw`.
- **Adoption-failure semantics.**
  - A tree is fully verified before adoption begins; structural verification is mutation-free.
  - Adoption is not transactionally rollbackable across arbitrary DOM property setters.
  - A setter that throws during adoption makes `hydrate` throw `adoption-failed`, with the setter's error as `cause`: nothing drawn, no listeners, no retry and no fallback draw. The composer owns the next action.
- **NEXUS integration through the composer.** `integration/` runs MPRX → MESH → NEXUS → composer → PORT → DOM and back, and the SSR path: NEXUS state → `realizeHtml` → a parsed page → a client NEXUS with the same state → `hydrate` → click → NEXUS → `update` of the server's own nodes. PORT doesn't depend on NEXUS.

### Not included

Streaming SSR; progressive or partial hydration; islands; event replay; routing; server components; preserving pre-hydration input; deferred property serialization; mismatch patching; recovery from parser restructuring; SVG and MathML (refused on the server, as are raw-text and `template` elements); targets other than the Web.

### Known limitations

These are the documented semantics of v0.2, not defects:

- **Structural mismatch:** any verified difference means a complete fresh draw. The page is correct; the server DOM isn't reused.
- **Parser restructuring:** nestings the HTML parser rewrites (a `button` inside a `button`, a `div` inside a `p`, table content) are caught only at hydration, as a structural mismatch.
- **Adoption setter failure:** `adoption-failed`, with no rollback of writes already made or of the setter's own effects. The same misconfigured table also makes `draw` throw (its nodes are still detached, so the container is untouched) and makes `update` throw mid-way, without rollback.
- **Pre-hydration input loss:** a slot the client's tree realizes as a present property is written over whatever was typed. An absent prop's slot is never written, as for any absent prop; that is not input preservation.
- **Pre-hydration interaction loss:** nothing is reported before `hydrate`, and nothing is replayed.
- **Several DOM event types from one gesture:** each is its own interaction, if the realization table maps them.

### Compatibility

- **MESH:** v0.6. `@valancex/mesh-runtime` `^0.6.0` is port-web's only peer dependency, used for the render tree's types. Tested with `@valancex/mesh-compiler` and `@valancex/mesh-runtime` 0.6.0, and MESH v0.6's conformance vectors. render-v1 is unchanged.
- **NEXUS:** integration-tested with `@valancex/nexus` 0.8.0, through the composer only.
- **Temporary dependency override:** the workspace root sets `pnpm.overrides` `"@valancex/nexus>@valancex/mesh-runtime": "^0.6.0"`, solely because NEXUS 0.8.0 declares `@valancex/mesh-runtime ^0.5.0`, which excludes 0.6. It affects only this repository's test workspace, not port-web. It will be removed in a separate change once NEXUS publishes a release accepting MESH runtime 0.6.

### Packages

- `@valancex/port-web` 0.2.0, with its entries `@valancex/port-web`, `@valancex/port-web/server` and `@valancex/port-web/package.json`.
- There is no shared `@valancex/port` package.

### Release

- **A release workflow**, `.github/workflows/release.yml`, as MESH's. A pushed `v*` tag runs all of CI on the tagged commit, packs `@valancex/port-web`, and checks that the tag is `v` + its version and that npm doesn't have it yet. It then publishes it to npm with provenance, and creates the GitHub release from `docs/releases/vX.Y.md` with the tarball attached. A manual run publishes only with `publish` set and only from a tag. A manual run without it, or a pull request changing the workflow, is a dry run. Publishing needs the `NPM_ACCESS_TOKEN` secret. CI no longer runs on tag pushes, since the release workflow runs it, and can be called and run by hand.

[0.2.4]: https://github.com/ValanceX/Port/releases/tag/v0.2.4
[0.2.3]: https://github.com/ValanceX/Port/releases/tag/v0.2.3
[0.2.2]: https://github.com/ValanceX/Port/releases/tag/v0.2.2
[0.2.1]: https://github.com/ValanceX/Port/releases/tag/v0.2.1
[0.2.0]: https://github.com/ValanceX/Port/releases/tag/v0.2.0
