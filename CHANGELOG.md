# Changelog

All notable changes to PORT are recorded here. The project follows [Semantic Versioning](https://semver.org). Until 1.0, minor versions may include breaking changes.

## [Unreleased]

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

[0.2.0]: https://github.com/ValanceX/Port/releases/tag/v0.2.0
