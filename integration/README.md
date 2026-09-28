# Integration: the Valance vertical slice

Private, never published. It proves that PORT works against the real upstream contracts, with nothing faked:

```text
MPRX ─▶ @valancex/mesh-compiler ─▶ template-v1 ─▶ @valancex/mesh-runtime ─▶ render-v1
     ─▶ @valancex/nexus (Mesh.host, state, commands) ─▶ composer ─▶ @valancex/port-web ─▶ DOM

DOM event ─▶ port-web ─▶ (handler, payload) ─▶ composer ─▶ NEXUS dispatch ─▶ command ─▶ state ─▶ new render ─▶ update in place
```

- **Inputs:** MESH's own slice (`../fixtures/mesh-slice`, copied verbatim from MESH v0.5.0 and unchanged in v0.6.0), compiled at test time.
- **Upstream:** the published `@valancex/mesh-compiler` 0.6, `@valancex/mesh-runtime` 0.6 and `@valancex/nexus` 0.9, from npm. NEXUS and the slice share one copy of `effect` and of `@valancex/mesh-runtime`: NEXUS declares `@valancex/mesh-runtime` `^0.6.0` itself, so no override is needed.
- **`test/compose.ts`** is the composer (it `show`s a host, or `hydrate`s server HTML with the client host's own render, which it retains): the only code that knows both NEXUS and PORT. It owns two facts nobody else has. **Program continuity:** one NEXUS MESH host renders one program, so the host's later renders are *updates*, and showing another host is a new program, *drawn* afresh. **The drawn render:** each PORT report is dispatched with the `Render` whose tree is drawn.
- **`test/app.ts`** is the slice's application: MESH's slice compiled with the real compiler, its NEXUS state, scope and command bindings, and the Web realization of its primitives.
- **`test/slice.test.ts`** runs the slice: draw, click an avatar (→ `users.select`), click Refresh (→ `users.refresh` → new render → the same `<img>` updated in place), and checks the intent against MESH's reviewed `select-first.intent.json`.
- **`test/composer.test.ts`** checks the composer's obligations. Each report dispatches with the render that was drawn when the event fired. A new program is drawn afresh with no DOM reused, and its events dispatch with its own render. A new program's handler dispatched with the old program's render is refused by MESH (`runtime-handler-other-program`), which is why the composer keeps the drawn render.
- **`test/mesh-v06.test.ts`** runs MESH v0.6's semantics through the slice: NEXUS's host uses the slice's one v0.6 runtime; a boolean prop reaches the DOM as MESH's `propText` in a text-only slot, and an update writes the new text in place; a value its slot can't hold is refused before the DOM changes; and with the first user's card inside the Refresh button, a click on the avatar is only `selectUser` and a click on the name only `refresh`, one command each.
- **`test/ssr.test.ts`** runs server rendering and hydration through the slice. A server NEXUS application renders the first snapshot, and `realizeHtml` writes it as HTML. A page parses it, and a client NEXUS application initialized with the same state hydrates it through the composer's `hydrate(host)`. Every server node is kept; a click on the server's avatar reaches NEXUS as MESH's reviewed intent; Refresh updates the server's own `<img>` in place, and the result matches a fresh draw. With a different client state, hydration reports the mismatch, keeps no server node, draws afresh, and carries on with the right intents and updates. It also checks that `@valancex/port-web/server` imports and runs in a Node process with no DOM.
- **`test/boundaries.test.ts`** checks the dependency directions against the installed packages: PORT Web doesn't depend on NEXUS, and NEXUS doesn't depend on PORT.

```console
$ pnpm --filter @valancex/port-integration test
```

## In Chromium: `browser/`

The same slice, in a real browser: Vitest browser mode, with Playwright 1.56.1 driving Chromium 1194. The browser is pre-installed where `PLAYWRIGHT_BROWSERS_PATH` points at it. CI runs `playwright install chromium`.

```console
$ pnpm --filter @valancex/port-integration run test:browser
```

- **`browser/setup.ts`** runs in Node. It compiles `../fixtures/mesh-slice` with the published MESH compiler, as `test/app.ts` does, and hands the page the program. The page never compiles MPRX.
- **`browser/slice.browser.test.ts`** runs in the page.
  - **Setup:**
    - MESH's engine is loaded with `init(url)` of `mesh-runtime.wasm`, once;
    - a NEXUS application is started on a **test-local platform**. It uses NEXUS's reference platform shape, `Layer.merge`, and provides one capability, `UsersSource`, plus Clock 42. `users.refresh` requires `UsersSource`;
    - the unchanged composer (`test/compose.ts`) shows the host in a real container.
  - **The positive path:**
    - the first render matches the jsdom slice;
    - a real click on the avatar gives MESH's reviewed intent, and `users.select` runs;
    - a real click on Refresh resolves `UsersSource` (one reload), changes the state, and updates the same `<img>` in place;
    - the static analysis says every unit is supported, and the platform's statement is conformant;
    - application code sees Clock 42. The caller, which also runs the composer and collects events with the ordinary `Fiber.join`, never does: before, during or after the run.
  - **The negative path.** With `UsersSource` absent:
    - `users.refresh` is incompatible;
    - the application still starts;
    - Refresh fails with `CapabilityUnavailableError`;
    - the state, DOM and status are unchanged;
    - the avatar still selects.

**What it doesn't prove:**
- SSR or hydration in a browser;
- a production bundle;
- a composer outside test code;
- more than one capability;
- concurrent interactions during a render.

Rendering still runs on the composer's side, outside the NEXUS application's lifecycle (NEXUS O15).

