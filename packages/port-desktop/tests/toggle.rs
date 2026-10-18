//! A toggle: a button that stays pressed. A click, or Enter or Space on it when it has focus, reports `change` with the value it is going to have (not a flip), and it shows what the application
//! renders next. Drawn with no window; the toggle is found in the accessibility tree and clicked, or reached with Tab.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree(pressed: bool) -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "c", "component": "column", "props": {}, "events": {}, "children": [
            { "type": "node", "key": "t", "component": "toggle", "props": { "pressed": pressed, "label": "Bold" }, "events": { "change": "h-bold" },
              "children": [ { "type": "text", "key": "x", "text": "B" } ] }
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
    fn new(pressed: bool) -> Window {
        let ctx = egui::Context::default();

        ctx.enable_accesskit();

        Window {
            ctx,
            view: View::default(),
            tree: tree(pressed),
            time: 0.0,
        }
    }

    fn frame(&mut self, events: Vec<egui::Event>) -> (Vec<Output>, egui::accesskit::TreeUpdate) {
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

        (
            out,
            full.platform_output
                .accesskit_update
                .expect("the accessibility tree"),
        )
    }

    fn click(&mut self) -> Vec<Output> {
        let (_, update) = self.frame(vec![]);
        let bounds = update
            .nodes
            .iter()
            .find(|(_, node)| {
                node.label() == Some("Bold") && node.role() == egui::accesskit::Role::Button
            })
            .and_then(|(_, node)| node.bounds())
            .expect("the toggle is a button named Bold");
        let at = egui::pos2(
            ((bounds.x0 + bounds.x1) / 2.0) as f32,
            ((bounds.y0 + bounds.y1) / 2.0) as f32,
        );
        let button = |pressed| egui::Event::PointerButton {
            pos: at,
            button: egui::PointerButton::Primary,
            pressed,
            modifiers: egui::Modifiers::NONE,
        };
        let (mut out, _) = self.frame(vec![egui::Event::PointerMoved(at), button(true)]);
        let (up, _) = self.frame(vec![button(false)]);

        out.extend(up);
        out
    }

    /// Tab to the toggle, then press `key` and release it.
    fn key(&mut self, key: egui::Key) -> Vec<Output> {
        let press = |pressed| egui::Event::Key {
            key,
            physical_key: Some(key),
            pressed,
            repeat: false,
            modifiers: egui::Modifiers::NONE,
        };
        let tab = |pressed| egui::Event::Key {
            key: egui::Key::Tab,
            physical_key: Some(egui::Key::Tab),
            pressed,
            repeat: false,
            modifiers: egui::Modifiers::NONE,
        };

        self.frame(vec![]);
        self.frame(vec![tab(true), tab(false)]);
        let (mut out, _) = self.frame(vec![press(true)]);
        let (up, _) = self.frame(vec![press(false)]);

        out.extend(up);
        out
    }
}

fn changes(out: &[Output]) -> Vec<(String, Option<serde_json::Value>)> {
    out.iter()
        .filter_map(|output| match output {
            Output::Report(report) => Some((report.handler.clone(), report.payload.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn a_toggle_is_a_button_that_says_whether_it_is_pressed() {
    let (_, off) = Window::new(false).frame(vec![]);
    let (_, on) = Window::new(true).frame(vec![]);
    let find = |update: &egui::accesskit::TreeUpdate| {
        update
            .nodes
            .iter()
            .map(|(_, node)| node.clone())
            .find(|node| node.label() == Some("Bold"))
            .expect("the toggle is named Bold")
    };

    assert_eq!(find(&off).role(), egui::accesskit::Role::Button);
    assert_eq!(find(&off).toggled(), Some(egui::accesskit::Toggled::False));
    assert_eq!(find(&on).toggled(), Some(egui::accesskit::Toggled::True));
}

#[test]
fn a_click_reports_the_value_the_toggle_is_going_to_have() {
    assert_eq!(
        changes(&Window::new(false).click()),
        vec![("h-bold".to_owned(), Some(serde_json::json!(true)))]
    );
    assert_eq!(
        changes(&Window::new(true).click()),
        vec![("h-bold".to_owned(), Some(serde_json::json!(false)))]
    );
}

#[test]
fn enter_and_space_on_the_focused_toggle_report_the_same() {
    assert_eq!(
        changes(&Window::new(false).key(egui::Key::Enter)),
        vec![("h-bold".to_owned(), Some(serde_json::json!(true)))]
    );
    assert_eq!(
        changes(&Window::new(false).key(egui::Key::Space)),
        vec![("h-bold".to_owned(), Some(serde_json::json!(true)))]
    );
}
