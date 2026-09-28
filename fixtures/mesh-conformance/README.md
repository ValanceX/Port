# MESH conformance fixture

A verbatim copy of `examples/conformance/` (except its README) from [ValanceX/Mesh](https://github.com/ValanceX/Mesh) at tag `v0.6.0`, commit `a8a046f`. Don't edit these files. To update them, re-copy them from a MESH tag and record the new commit here.

Copied files: `components.json`, and `values/` and `events/`, each with `program.json`, its `.mprx` templates, `snapshot.json`, `expected.tree.json` and `cases.json`.

MESH's vectors for a renderer: `values/` pins each value's `propText` (spec §9.7.7, §9.8.2, §9.8.7), and `events/` pins event resolution (spec §9.9). `packages/port-web/test/conformance.test.ts` renders each program with the real compiler and runtime, checks the result is MESH's committed tree, and then checks that the Web PORT realizes every value case and resolves every event case exactly as given, through a real DOM.
