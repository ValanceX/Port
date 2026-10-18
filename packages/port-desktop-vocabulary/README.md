# @valancex/port-desktop-vocabulary

The Desktop PORT's vocabulary as data, for the tools that check a template against it (`vlx check`, editors). The PORT itself is the Rust crate `valancex-port-desktop`; this package is its `vocabulary.json` (the components a template may write for a native window, with their props and events) and `content.json` (the content layer: paragraphs, lists, code, links, images), published so a tool does not have to carry a copy.

```js
import { createRequire } from "node:module";

const vocabulary = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("@valancex/port-desktop-vocabulary/vocabulary.json"), "utf8"));
```

`vocabulary.json` declares twenty components (the layout and text components, a button, a toggle, a checkbox, a text field, a choice group, two live regions (`status`, `alert`), a caption and a static table, with seven event verbs: `click`, `change`, `submit`, `cancel`, `focus`, `blur`, `select`); `content.json` declares the nine content components. Each release's additions are in the [release notes](../../docs/releases) and the [Desktop PORT's README](../port-desktop/README.md#the-vocabulary), which has a table of every component, prop and event.

Both files are MESH manifests (`version: 1`). The crate's files are the source: this package's copies are made from them before every pack and test (`pnpm --filter @valancex/port-desktop-vocabulary sync`) and are not committed. Its version moves with the PORT's.
