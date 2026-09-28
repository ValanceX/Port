# MESH slice fixture

A verbatim copy of `examples/slice/` from [ValanceX/Mesh](https://github.com/ValanceX/Mesh) at tag `v0.5.0`, commit `c0ef6d558d6f60478722910d564567a573579518`, unchanged at tag `v0.6.0`, commit `a8a046f`. It's the same copy NEXUS's `tests/fixtures/mesh-slice/` holds. Don't edit these files. To update them, re-copy them from a MESH tag and record the new commit here.

Copied files: `components.json`, `users.mprx`, `user-card.mprx`, `snapshots/first.json`, `snapshots/second.json`, `expected/first.tree.json`, `expected/select-first.intent.json`, `expected/first-to-second.changes`.

The tests compile the two templates with `@valancex/mesh-compiler` and render them with `@valancex/mesh-runtime`, so the trees PORT draws are MESH's real output. `expected/first.tree.json` pins that the published packages still produce MESH's reviewed tree.
