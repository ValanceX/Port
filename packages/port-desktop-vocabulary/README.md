# @valancex/port-desktop-vocabulary

The Desktop PORT's vocabulary as data, for the tools that check a template against it (`vlx check`, editors). The PORT itself is the Rust crate `valancex-port-desktop`; this package is its `vocabulary.json` (the components a template may write for a native window, with their props and events) and `content.json` (the content layer: paragraphs, lists, code, links, images), published so a tool does not have to carry a copy.

```js
import { createRequire } from "node:module";

const vocabulary = JSON.parse(readFileSync(createRequire(import.meta.url).resolve("@valancex/port-desktop-vocabulary/vocabulary.json"), "utf8"));
```

Both files are MESH manifests (`version: 1`). The crate's files are the source: this package's copies are made from them before every pack and test (`pnpm --filter @valancex/port-desktop-vocabulary sync`) and are not committed. Its version moves with the PORT's.
