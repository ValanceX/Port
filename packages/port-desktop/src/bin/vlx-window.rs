#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

//! The window `vlx dev` opens for a desktop project: any application's engine, in the Desktop PORT's window. The engine is the command line in `VLX_ENGINE` (`node dist/desktop/engine.mjs`; split
//! on spaces, so a path with a space in it is not one `vlx dev` can use). The window's title is the application's: it says so over the protocol, and this name shows only until it does.
use port_desktop::app::{run, Options};

fn main() -> eframe::Result {
    run(Options {
        title: "VALANCE".into(),
        engine_env: "VLX_ENGINE".into(),
        engine_sibling: "vlx-engine".into(),
        size: [960.0, 720.0],
    })
}
