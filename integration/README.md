# Integration: the Valance vertical slice

Private, never published. It proves that PORT works against the real upstream contracts, with nothing faked:

```text
MPRX ─▶ @valancex/mesh-compiler ─▶ template-v1 ─▶ @valancex/mesh-runtime ─▶ render-v1
     ─▶ @valancex/nexus (Mesh.host, state, commands) ─▶ composer ─▶ @valancex/port-web ─▶ DOM

DOM event ─▶ port-web ─▶ (handler, payload) ─▶ composer ─▶ NEXUS dispatch ─▶ command ─▶ state ─▶ new render ─▶ update in place
```

- **Inputs:** MESH's own slice (`../fixtures/mesh-slice`, copied verbatim from MESH v0.5.0), compiled at test time.
- **Upstream:** the published `@valancex/mesh-compiler` 0.5, `@valancex/mesh-runtime` 0.5 and `@valancex/nexus` 0.8, from npm. NEXUS and the slice share one copy of `effect` and of `@valancex/mesh-runtime`.
- **`test/compose.ts`** is the composer: the only code that knows both NEXUS and PORT. It draws the host's render, updates the PORT with each later render, and dispatches each PORT report with the `Render` whose tree is drawn.
- **`test/slice.test.ts`** runs the slice: draw, click an avatar (→ `users.select`), click Refresh (→ `users.refresh` → new render → the same `<img>` updated in place), and checks the intent against MESH's reviewed `select-first.intent.json`.
- **`test/boundaries.test.ts`** checks the dependency directions against the installed packages: PORT Web doesn't depend on NEXUS, and NEXUS doesn't depend on PORT.

```console
$ pnpm --filter @valancex/port-integration test
```
