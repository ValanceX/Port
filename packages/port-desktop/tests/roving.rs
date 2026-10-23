//! Roving focus in a radio group (the ARIA Authoring Practices "Radio Group" keyboard pattern, as the reference for the keys only; decision I10): Tab reaches the group at one radio, the checked one
//! or else the first, and leaves it from there; the arrows move focus to the next or the previous radio, wrapping, and choose it. Each is looked at as the accessibility tree says it:
//! which node has focus, and what is reported.
#![cfg(feature = "window")]

use port_desktop::port::Report;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};

fn radio(key: &str, checked: bool) -> Value {
    json!({"type": "node", "key": key, "component": "radio", "props": {"label": key, "value": key, "checked": checked}, "events": {"select": format!("select-{key}")}, "children": []})
}

fn button(key: &str) -> Value {
    json!({"type": "node", "key": key, "component": "button", "props": {"label": key}, "events": {"click": format!("click-{key}")}, "children": []})
}

/// A button, a group of three radios of which `checked` is the chosen one (or none), and a button.
fn screen(checked: Option<&str>) -> Tree {
    let radios: Vec<Value> = ["s", "m", "l"]
        .iter()
        .map(|key| radio(key, checked == Some(*key)))
        .collect();

    serde_json::from_value(json!({
        "format": "mesh-render", "version": 1,
        "root": {"type": "node", "key": "root", "component": "column", "props": {}, "events": {}, "children": [
            button("before"),
            {"type": "node", "key": "size", "component": "radiogroup", "props": {"label": "Size"}, "events": {}, "children": radios},
            button("after")
        ]}
    })).unwrap()
}

struct Window {
    ctx: egui::Context,
    view: View,
    /// The modifiers held in the frames being run (the toolkit reads them from the input's state, not from the key event).
    modifiers: egui::Modifiers,
}

impl Window {
    fn new() -> Window {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();

        Window {
            ctx,
            view: View::default(),
            modifiers: egui::Modifiers::NONE,
        }
    }

    /// One frame with `events`; the label of the node that has focus, and what was reported.
    fn frame(&mut self, tree: &Tree, events: Vec<egui::Event>) -> (Option<String>, Vec<String>) {
        let mut out: Vec<Output> = Vec::new();
        let view = &mut self.view;
        let update = self
            .ctx
            .run(
                egui::RawInput {
                    events,
                    modifiers: self.modifiers,
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default()
                        .show(ctx, |ui| view.show(ui, &tree.root, &mut out));
                },
            )
            .platform_output
            .accesskit_update
            .expect("the accessibility tree");
        let focused = update
            .nodes
            .iter()
            .find(|(id, _)| *id == update.focus)
            .and_then(|(_, node)| node.label().map(str::to_owned));
        let reported = out
            .into_iter()
            .filter_map(|output| match output {
                Output::Report(Report { handler, .. }) => Some(handler),
                Output::Link(_) => None,
            })
            .collect();

        (focused, reported)
    }

    fn press(&mut self, tree: &Tree, key: egui::Key, shift: bool) -> (Option<String>, Vec<String>) {
        let modifiers = egui::Modifiers {
            shift,
            ..Default::default()
        };
        let event = |pressed| egui::Event::Key {
            key,
            physical_key: Some(key),
            pressed,
            repeat: false,
            modifiers,
        };
        self.modifiers = modifiers;

        let (_, reported) = self.frame(tree, vec![event(true)]);

        self.modifiers = egui::Modifiers::NONE;

        // the toolkit moves focus backwards a frame late, so that the widget can tell it gained it; what the person sees is the frame after
        let (focused, _) = self.frame(tree, vec![event(false)]);

        (focused, reported)
    }

    fn focus(&mut self, tree: &Tree, key: &str) {
        self.view.focus(key);
        self.frame(tree, vec![]);
        self.frame(tree, vec![]);
    }
}

#[test]
fn tab_reaches_the_group_at_the_checked_radio_and_leaves_it_from_there() {
    let tree = screen(Some("m"));
    let mut window = Window::new();

    window.focus(&tree, "before");
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("m"),
        "not s: the checked one is the stop"
    );
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("after"),
        "one tab stop: the next Tab leaves the group"
    );
    assert_eq!(
        window.press(&tree, egui::Key::Tab, true).0.as_deref(),
        Some("m")
    );
    assert_eq!(
        window.press(&tree, egui::Key::Tab, true).0.as_deref(),
        Some("before")
    );
}

#[test]
fn with_nothing_chosen_the_first_radio_is_the_stop() {
    let tree = screen(None);
    let mut window = Window::new();

    window.focus(&tree, "before");
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("s")
    );
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("after")
    );
}

#[test]
fn the_arrows_move_focus_and_choose_wrapping_at_the_ends() {
    let tree = screen(Some("s"));
    let mut window = Window::new();

    window.focus(&tree, "s");
    assert_eq!(
        window.press(&tree, egui::Key::ArrowDown, false),
        (Some("m".into()), vec!["select-m".into()])
    );
    assert_eq!(
        window.press(&tree, egui::Key::ArrowRight, false),
        (Some("l".into()), vec!["select-l".into()])
    );
    assert_eq!(
        window.press(&tree, egui::Key::ArrowDown, false),
        (Some("s".into()), vec![]),
        "wraps to the first, which is the checked one: nothing to choose"
    );
    assert_eq!(
        window.press(&tree, egui::Key::ArrowUp, false),
        (Some("l".into()), vec!["select-l".into()]),
        "wraps to the last"
    );
    assert_eq!(
        window.press(&tree, egui::Key::ArrowLeft, false),
        (Some("m".into()), vec!["select-m".into()])
    );
}

#[test]
fn the_stop_follows_the_arrows_before_the_application_answers_and_then_the_application() {
    let mut window = Window::new();
    let before = screen(Some("s"));

    window.focus(&before, "s");
    window.press(&before, egui::Key::ArrowDown, false);

    // the answer has not come: Tab leaves from m, where focus is
    assert_eq!(
        window.press(&before, egui::Key::Tab, false).0.as_deref(),
        Some("after")
    );
    assert_eq!(
        window.press(&before, egui::Key::Tab, true).0.as_deref(),
        Some("m")
    );

    // the application chose l: that is the stop now
    let chose_l = screen(Some("l"));

    window.focus(&chose_l, "before");
    assert_eq!(
        window.press(&chose_l, egui::Key::Tab, false).0.as_deref(),
        Some("l")
    );
}

#[test]
fn tab_past_the_last_widget_wraps_to_the_first() {
    let tree = screen(Some("s"));
    let mut window = Window::new();

    window.focus(&tree, "after");
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("before")
    );
}

#[test]
fn space_chooses_the_radio_that_has_focus() {
    let tree = screen(None);
    let mut window = Window::new();

    window.focus(&tree, "before");
    assert_eq!(
        window.press(&tree, egui::Key::Tab, false).0.as_deref(),
        Some("s")
    );
    assert_eq!(
        window.press(&tree, egui::Key::Space, false),
        (Some("s".into()), vec!["select-s".into()])
    );
}
