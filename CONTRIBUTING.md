# Contributing to PORT

Bug reports and pull requests are welcome on [GitHub](https://github.com/ValanceX/Port/issues). This is how to work on PORT itself; to use it, start at the [documentation](docs/README.md).

## Documentation

Documentation lives in `docs/`, organized by what the reader wants to do: `tutorials/` (learn by building), `how-to/` (one task each), `reference/` (exact behavior) and `explanation/` (why, and the design record). A pull request that changes behavior updates the page that describes it, in the same pull request. Every page starts with a one-line summary and ends with where to go next.

## Checks and releases

The two npm packages are checked with `pnpm install`, `pnpm typecheck` and `pnpm test`; the Desktop PORT with `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings` and `cargo test --locked` (also `--no-default-features`), in `packages/port-desktop`. A release is a tag: `v*` publishes the two npm packages (`.github/workflows/release.yml`) and `desktop-v*` the crate and the `vlx-window` program (`release-desktop.yml`); the version in each package, the changelog entry and the release notes are prepared in a pull request before it.
