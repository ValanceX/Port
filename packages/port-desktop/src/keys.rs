//! The keys the window gives meaning to without being asked, and no others. A key is mapped only where the platform has a convention for it; where it has none the key is left unmapped
//! rather than invented (docs/architecture/2026-10-14-port-desktop.md, "Keys").
//!
//! - Enter in a text field is `submit` and Escape is `cancel`: SwiftUI documents Return and Escape as the platform's default and cancel shortcuts, and Windows and Linux dialogs follow the
//!   same convention. Those are the text field's events (see `view`).
//! - Back and Forward, for an engine that keeps a list of pages: Alt+Left and Alt+Right, and a mouse's back and forward buttons. Microsoft's back-navigation guidance names Alt+Left, the Back
//!   key and the mouse's back button. On macOS the key is **unmapped**: no current Apple guidance for Back and Forward keys could be read, and the guess would be an invented shortcut. The
//!   mouse buttons are not keys and are mapped everywhere.

/// Which way the person asked to move along the pages they visited.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    Back,
    Forward,
}

impl Direction {
    /// The word the host protocol uses for it.
    pub fn word(self) -> &'static str {
        match self {
            Direction::Back => "back",
            Direction::Forward => "forward",
        }
    }
}

/// The move the person asked for in this frame, if any. `mac` leaves the keys unmapped (the mouse buttons stay).
pub fn navigation(input: &egui::InputState, mac: bool) -> Option<Direction> {
    if input.pointer.button_pressed(egui::PointerButton::Extra1) {
        return Some(Direction::Back);
    }
    if input.pointer.button_pressed(egui::PointerButton::Extra2) {
        return Some(Direction::Forward);
    }

    let only_alt = input.modifiers.alt
        && !input.modifiers.ctrl
        && !input.modifiers.shift
        && !input.modifiers.command
        && !input.modifiers.mac_cmd;

    if mac || !only_alt {
        return None;
    }
    if input.key_pressed(egui::Key::ArrowLeft) {
        Some(Direction::Back)
    } else if input.key_pressed(egui::Key::ArrowRight) {
        Some(Direction::Forward)
    } else {
        None
    }
}
