//! The Desktop PORT: realizes MESH render trees (`render-v1`) as native windows and reports what the person does as handler identifiers and payloads. See the package README and
//! `docs/explanation/design-records/2026-10-14-port-desktop.md` in the PORT repository.
//!
//! The pieces, from the contract outward: [`tree`] (the input), [`port`] (draw, update, unmount, reports), [`host`] (driving it from an engine in another process), [`vocabulary`] (the components a
//! template may write) and, with the `window` feature, [`view`] and [`app`] (the egui window).
pub mod field;
pub mod focus;
pub mod host;
pub mod port;
pub mod reload;
pub mod theme;
pub mod tree;
pub mod vocabulary;

#[cfg(feature = "window")]
pub mod app;
#[cfg(feature = "window")]
pub mod keys;
#[cfg(feature = "window")]
pub mod view;
