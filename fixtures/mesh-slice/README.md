# MESH slice fixture

A verbatim copy of `examples/slice/` from [ValanceX/Mesh](https://github.com/ValanceX/Mesh) at tag `v0.18.0`, commit `db5f62f72067891858f8e23090d905f15578a3f6`. Only `expected/select-first.intent.json` changed since v0.5.0 (v0.18 puts each argument's `name` on the intent); the rest is byte-identical. It's the same copy NEXUS's `tests/fixtures/mesh-slice/` holds. Don't edit these files. To update them, re-copy them from a MESH tag and record the new commit here.

Copied files: `components.json`, `users.mprx`, `user-card.mprx`, `snapshots/first.json`, `snapshots/second.json`, `expected/first.tree.json`, `expected/select-first.intent.json`, `expected/first-to-second.changes`.

The tests compile the two templates with `@valancex/mesh-compiler` and render them with `@valancex/mesh-runtime`, so the trees PORT draws are MESH's real output. `expected/first.tree.json` pins that the published packages still produce MESH's reviewed tree.
