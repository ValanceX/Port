# PORT documentation

Documentation for **PORT** (v0.9 prepared; v0.8 is the latest release). New here? Start with the [PORT contract](./CONTRACT.md), then the [architecture](./ARCHITECTURE.md).

## The contract and the architecture

- [**The PORT contract**](./CONTRACT.md): what every PORT promises: `draw`, `update`, `unmount` (and the optional `patch`) in, `(handler, payload)` out, and the rules for realizing values and resolving events.
- [**Architecture**](./ARCHITECTURE.md): PORT's responsibilities and rules, the packages, and why the first PORT is an experiment.
- [**API stability**](./stability.md): what each public surface of `@valancex/port-web`, `@valancex/port-desktop-vocabulary` and `valancex-port-desktop` promises (stable, unreleased, not part of the contract, internal).
- [**Roadmap**](./ROADMAP.md): the phases from the boundary freeze to V1, what is done and what is not.

## The two targets

- **The Web PORT** (`@valancex/port-web`): its [README](../packages/port-web/README.md); [how it realizes each value in each slot](./architecture/2026-09-28-web-value-realization.md); the [SSR and hydration design](./superpowers/specs/2026-09-28-port-web-ssr.md); the [patch application design](./superpowers/specs/2026-10-06-port-web-patch-application.md).
- **The Desktop PORT** (`valancex-port-desktop`): its [README](../packages/port-desktop/README.md) (the vocabulary, the contract, `vlx-window`); the [architecture note](./architecture/2026-10-14-port-desktop.md) (why it is its own package, the host protocol, keys); its vocabulary as data in [`@valancex/port-desktop-vocabulary`](../packages/port-desktop-vocabulary/README.md).

## Background

- [**Integration audit**](./architecture/2026-09-27-port-integration-audit.md): the evidence behind the boundary, with open questions and contradictions.
- [**MESH semantic handoff**](./architecture/2026-09-27-mesh-semantic-handoff.md), with the [event propagation audit](./architecture/2026-09-27-event-propagation-audit.md) and the [value realization audit](./architecture/2026-09-27-value-realization-audit.md): the questions MESH v0.6 answered.
- [**API review baseline**](./superpowers/specs/2026-10-09-api-review-freeze.md).
- Release notes for [**v0.9**](./releases/v0.9.md), [**v0.8**](./releases/v0.8.md), [**v0.7**](./releases/v0.7.md), [**v0.6**](./releases/v0.6.md), [**v0.5**](./releases/v0.5.md), [**v0.4**](./releases/v0.4.md), [**v0.3**](./releases/v0.3.md) and [**v0.2**](./releases/v0.2.md), and the [**changelog**](../CHANGELOG.md).

## For contributors

The two npm packages are checked with `pnpm install`, `pnpm typecheck` and `pnpm test`; the Desktop PORT with `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked` (also `--no-default-features`), in `packages/port-desktop`. A release is a tag: `v*` publishes the two npm packages (`.github/workflows/release.yml`) and `desktop-v*` the crate and the `vlx-window` program (`release-desktop.yml`); the version in each package, the changelog entry and the release notes are prepared in a pull request before it.
