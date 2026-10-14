//! Enter in a text field is the event `submit`: the person is done with what they typed. Clicking into the field and pressing Enter, with no window, reports it once; any other key reports nothing.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree() -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "c", "component": "column", "props": {}, "events": {}, "children": [
            { "type": "node", "key": "f", "component": "textfield", "props": { "value": "", "label": "New item" }, "events": { "submit": "h-submit", "change": "h-change" }, "children": [] }
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
