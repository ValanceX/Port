// Generates overlays/dialog-modal.vectors.json from overlays/apg-dialog-modal.source.json: the keyboard behavior of the ARIA Authoring Practices modal dialog pattern as steps and expectations that a
// target runs against its own dialog (Web: a real browser, in integration/browser; Desktop: tests/overlay_vectors.rs). The pattern is the reference for the keys only.
//
//   node scripts/generate-overlay-vectors.mjs             writes the vectors
//   node scripts/generate-overlay-vectors.mjs --check     fails if the committed vectors are not what the rows generate
//   node scripts/generate-overlay-vectors.mjs --check-source   fetches the pinned pattern and fails if a quoted row is not in it
//
// The scenario every vector runs in (a target builds it from `layout`): a page of two buttons, `opener` and `elsewhere`, and a modal dialog named "Dialog" holding `tabbables` buttons `d1`..`dn`. The
// application opens the dialog when told (`open`), honors `dismiss` by closing it unless `ignores` is true, and can remove `opener` from the page (`remove`).
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const source = JSON.parse(readFileSync(`${root}overlays/apg-dialog-modal.source.json`, "utf8"));
const out = `${root}overlays/dialog-modal.vectors.json`;
const names = (n) => Array.from({ length: n }, (_, index) => `d${index + 1}`);

const vectors = [];

for (const n of [1, 2, 3]) {
  const layout = { tabbables: n };
  const open = [{ focus: "opener" }, { open: true }];
  const add = (name, row, steps, extra = {}) => vectors.push({ name: `${name}/${n}`, apg: source.rows[row], layout, ...extra, steps });

  add("focus-moves-inside-when-it-opens", "opens", [...open, { expect: { focused: "d1", open: true } }]);
  add("it-is-modal", "modal", [...open, { expect: { modal: true, name: "Dialog" } }]);

  for (let at = 1; at < n; at += 1) {
    add(`tab-from-d${at}-moves-to-the-next`, "tab-next", [...open, ...Array.from({ length: at - 1 }, () => ({ press: "Tab" })), { expect: { focused: `d${at}` } }, { press: "Tab" }, { expect: { focused: `d${at + 1}` } }]);
    add(`shift-tab-from-d${at + 1}-moves-to-the-previous`, "shift-tab-previous", [...open, ...Array.from({ length: at }, () => ({ press: "Tab" })), { expect: { focused: `d${at + 1}` } }, { press: "Shift+Tab" }, { expect: { focused: `d${at}` } }]);
  }

  add("tab-from-the-last-wraps-to-the-first", "tab-wrap", [...open, ...Array.from({ length: n - 1 }, () => ({ press: "Tab" })), { expect: { focused: `d${n}` } }, { press: "Tab" }, { expect: { focused: "d1" } }]);
  add("shift-tab-from-the-first-wraps-to-the-last", "shift-tab-wrap", [...open, { expect: { focused: "d1" } }, { press: "Shift+Tab" }, { expect: { focused: `d${n}` } }]);
  add("what-is-under-it-is-inert", "inert", [...open, ...Array.from({ length: 2 * n + 1 }, () => ({ press: "Tab", expect: { focusedIn: names(n) } })), ...Array.from({ length: n + 1 }, () => ({ press: "Shift+Tab", expect: { focusedIn: names(n) } }))]);
  add("escape-closes-it-and-the-invoker-has-focus-again", "escape", [...open, { press: "Escape" }, { expect: { reported: ["dismiss:escape"], open: false, focused: "opener" } }]);
  add("focus-returns-to-the-invoker-it-was-not-the-first-button", "returns", [{ focus: "elsewhere" }, { open: true }, { press: "Escape" }, { expect: { open: false, focused: "elsewhere" } }]);
  add("a-dialog-the-application-keeps-open-stays-open", "escape", [...open, { press: "Escape" }, { expect: { reported: ["dismiss:escape"], open: true, focusedIn: names(n) } }], { app: { ignores: true } });
  add("the-invoker-is-gone-so-focus-goes-to-another-element", "invoker-gone", [...open, { remove: "opener" }, { press: "Escape" }, { expect: { open: false, focused: "elsewhere" } }]);
}

const generated = `${JSON.stringify({ pattern: source.pattern, commit: source.commit, generatedBy: "scripts/generate-overlay-vectors.mjs", vectors }, null, 2)}\n`;
const mode = process.argv[2];

if (mode === "--check") {
  if (readFileSync(out, "utf8") !== generated) {
    console.error("overlays/dialog-modal.vectors.json is not what the rows generate: run node scripts/generate-overlay-vectors.mjs");
    process.exit(1);
  }
} else if (mode === "--check-source") {
  const page = await (await fetch(source.source)).text();
  const text = page.replace(/<[^>]+>/g, " ").replace(/&quot;|&#39;/g, "'").replace(/\s+/g, " ");
  const missing = Object.entries(source.rows).filter(([, quote]) => !text.includes(quote.replace(/\s+/g, " ")));

  if (missing.length > 0) {
    console.error(`not in the pattern at ${source.commit}:`, missing.map(([id]) => id).join(", "));
    process.exit(1);
  }
} else {
  writeFileSync(out, generated);
}
