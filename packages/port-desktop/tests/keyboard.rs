//! Enter in a text field is the event `submit` (the person is done with what they typed) and Escape is `cancel` (they back out). Clicking into the field and pressing the key, with no window,
//! reports it once; any other key reports nothing. Alt+Left and Alt+Right (and the mouse's back and forward buttons) ask to move along the pages visited; on macOS the keys are unmapped.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree() -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "c", "component": "column", "props": {}, "events": {}, "children": [
            { "type": "node", "key": "f", "component": "textfield", "props": { "value": "", "label": "New item" }, "events": { "submit": "h-submit", "cancel": "h-cancel", "change": "h-change" }, "children": [] }
        ] }
    }))
    .expect("a render-v1 tree")
}

struct Window {
    ctx: egui::Context,
    view: View,
    tree: Tree,
    time: f64,
}

impl Window {
    fn new() -> Window {
        let ctx = egui::Context::default();

        ctx.enable_accesskit();

        Window {
            ctx,
            view: View::default(),
            tree: tree(),
            time: 0.0,
        }
    }

    /// One frame with `events`; what the view reported, and where the text field is on screen.
    fn frame(&mut self, events: Vec<egui::Event>) -> (Vec<Output>, Option<egui::Pos2>) {
        let mut out: Vec<Output> = Vec::new();

        self.time += 0.1;

        let mut input = egui::RawInput {
            time: Some(self.time),
            events,
            ..Default::default()
        };

        input.screen_rect = Some(egui::Rect::from_min_size(
            egui::Pos2::ZERO,
            egui::vec2(600.0, 400.0),
        ));

        let full = self.ctx.run(input, |ctx| {
            egui::CentralPanel::default()
                .show(ctx, |ui| self.view.show(ui, &self.tree.root, &mut out));
        });
        let at = full.platform_output.accesskit_update.and_then(|update| {
            update.nodes.iter().find_map(|(_, node)| {
                (node.role() == egui::accesskit::Role::TextInput)
                    .then(|| node.bounds())
                    .flatten()
                    .map(|bounds| {
                        egui::pos2(
                            ((bounds.x0 + bounds.x1) / 2.0) as f32,
                            ((bounds.y0 + bounds.y1) / 2.0) as f32,
                        )
                    })
            })
        });

        (out, at)
    }
}

fn key(key: egui::Key, pressed: bool) -> egui::Event {
    egui::Event::Key {
        key,
        physical_key: Some(key),
        pressed,
        repeat: false,
        modifiers: egui::Modifiers::NONE,
    }
}

fn focused() -> Window {
    let mut window = Window::new();
    let (_, at) = window.frame(vec![]);
    let at = at.expect("the text field is on screen");
    let click = |pressed| egui::Event::PointerButton {
        pos: at,
        button: egui::PointerButton::Primary,
        pressed,
        modifiers: egui::Modifiers::NONE,
    };

    window.frame(vec![egui::Event::PointerMoved(at), click(true)]);
    window.frame(vec![click(false)]);
    window.frame(vec![]);

    window
}

fn submits(out: &[Output]) -> usize {
    out.iter()
        .filter(|output| matches!(output, Output::Report(report) if report.handler == "h-submit"))
        .count()
}

#[test]
fn enter_in_a_focused_field_reports_submit_once() {
    let mut window = focused();
    let (down, _) = window.frame(vec![key(egui::Key::Enter, true)]);
    let (up, _) = window.frame(vec![key(egui::Key::Enter, false)]);

    assert_eq!(submits(&down) + submits(&up), 1, "{down:?} {up:?}");
}

#[test]
fn another_key_reports_no_submit() {
    let mut window = focused();
    let (down, _) = window.frame(vec![key(egui::Key::A, true)]);
    let (up, _) = window.frame(vec![key(egui::Key::A, false)]);

    assert_eq!(submits(&down) + submits(&up), 0);
}

fn cancels(out: &[Output]) -> usize {
    out.iter()
        .filter(|output| matches!(output, Output::Report(report) if report.handler == "h-cancel"))
        .count()
}

#[test]
fn escape_in_a_focused_field_reports_cancel_once_and_not_submit() {
    let mut window = focused();
    let (down, _) = window.frame(vec![key(egui::Key::Escape, true)]);
    let (up, _) = window.frame(vec![key(egui::Key::Escape, false)]);

    assert_eq!(cancels(&down) + cancels(&up), 1, "{down:?} {up:?}");
    assert_eq!(submits(&down) + submits(&up), 0);
}

#[test]
fn enter_reports_no_cancel() {
    let mut window = focused();
    let (down, _) = window.frame(vec![key(egui::Key::Enter, true)]);

    assert_eq!(cancels(&down), 0);
}

fn asked(events: Vec<egui::Event>, mac: bool) -> Option<port_desktop::keys::Direction> {
    let ctx = egui::Context::default();
    let mut found = None;
    let modifiers = events
        .iter()
        .find_map(|event| match event {
            egui::Event::Key { modifiers, .. } => Some(*modifiers),
            _ => None,
        })
        .unwrap_or(egui::Modifiers::NONE);

    let _ = ctx.run(
        egui::RawInput {
            events,
            modifiers,
            ..Default::default()
        },
        |ctx| found = ctx.input(|input| port_desktop::keys::navigation(input, mac)),
    );

    found
}

fn alt(key: egui::Key) -> Vec<egui::Event> {
    vec![egui::Event::Key {
        key,
        physical_key: Some(key),
        pressed: true,
        repeat: false,
        modifiers: egui::Modifiers::ALT,
    }]
}

#[test]
fn alt_left_and_alt_right_ask_for_back_and_forward_where_the_platform_has_them() {
    use port_desktop::keys::Direction::{Back, Forward};

    assert_eq!(asked(alt(egui::Key::ArrowLeft), false), Some(Back));
    assert_eq!(asked(alt(egui::Key::ArrowRight), false), Some(Forward));
    assert_eq!(asked(alt(egui::Key::ArrowUp), false), None);
}

#[test]
fn the_arrow_keys_alone_or_with_other_modifiers_are_not_navigation() {
    let plain = vec![key(egui::Key::ArrowLeft, true)];

    assert_eq!(asked(plain, false), None);

    for modifiers in [
        egui::Modifiers::CTRL,
        egui::Modifiers::SHIFT,
        egui::Modifiers::ALT | egui::Modifiers::SHIFT,
        egui::Modifiers::ALT | egui::Modifiers::CTRL,
    ] {
        let event = vec![egui::Event::Key {
            key: egui::Key::ArrowLeft,
            physical_key: Some(egui::Key::ArrowLeft),
            pressed: true,
            repeat: false,
            modifiers,
        }];

        assert_eq!(asked(event, false), None, "{modifiers:?}");
    }
}

#[test]
fn on_macos_the_keys_are_left_unmapped() {
    assert_eq!(asked(alt(egui::Key::ArrowLeft), true), None);
    assert_eq!(asked(alt(egui::Key::ArrowRight), true), None);
}
