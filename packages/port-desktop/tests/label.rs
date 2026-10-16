//! A `label`: the text written inside it is the visible text and the accessible name of the control written inside it, and a click on the text does what a click on the control does.
//! Drawn with no window; the text is found in the tree and clicked.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree() -> Tree {
    let node = |key: &str,
                component: &str,
                props: serde_json::Value,
                events: serde_json::Value,
                children: serde_json::Value| {
        serde_json::json!({ "type": "node", "key": key, "component": component, "props": props, "events": events, "children": children })
    };
    let text = |text: &str| serde_json::json!({ "type": "text", "key": text, "text": text });

    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": node("c", "column", serde_json::json!({}), serde_json::json!({}), serde_json::json!([
            node("l1", "label", serde_json::json!({}), serde_json::json!({}), serde_json::json!([
                node("cb", "checkbox", serde_json::json!({ "checked": false }), serde_json::json!({ "change": "h-agree" }), serde_json::json!([])),
                text("I agree")
            ])),
            node("l2", "label", serde_json::json!({}), serde_json::json!({}), serde_json::json!([
                node("r", "radio", serde_json::json!({ "checked": false, "value": "pro" }), serde_json::json!({ "select": "h-pro" }), serde_json::json!([])),
                text("Pro")
            ])),
            node("l3", "label", serde_json::json!({}), serde_json::json!({}), serde_json::json!([
                text("Email"),
                node("f", "textfield", serde_json::json!({ "value": "" }), serde_json::json!({ "focus": "h-focus" }), serde_json::json!([]))
            ]))
        ]))
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

    /// One frame with `events`; what the view reported, and the accessibility tree.
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

    fn centre(update: &egui::accesskit::TreeUpdate, name: &str) -> egui::Pos2 {
        let bounds = update
            .nodes
            .iter()
            .find(|(_, node)| node.label() == Some(name) || node.value() == Some(name))
            .and_then(|(_, node)| node.bounds())
            .unwrap_or_else(|| panic!("nothing named {name}"));

        egui::pos2(
            ((bounds.x0 + bounds.x1) / 2.0) as f32,
            ((bounds.y0 + bounds.y1) / 2.0) as f32,
        )
    }

    fn click(&mut self, name: &str) -> Vec<Output> {
        let (_, update) = self.frame(vec![]);
        let at = Window::centre(&update, name);
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
}

fn reports(out: &[Output]) -> Vec<(String, Option<serde_json::Value>)> {
    out.iter()
        .filter_map(|output| match output {
            Output::Report(report) => Some((report.handler.clone(), report.payload.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn the_text_inside_a_label_is_the_name_of_the_control_inside_it() {
    let (_, update) = Window::new().frame(vec![]);
    let role = |name: &str| {
        update
            .nodes
            .iter()
            .map(|(_, node)| node)
            .find(|node| node.label() == Some(name))
            .unwrap_or_else(|| panic!("no control named {name}"))
            .role()
    };

    assert_eq!(role("I agree"), egui::accesskit::Role::CheckBox);
    assert_eq!(role("Pro"), egui::accesskit::Role::RadioButton);
    assert_eq!(role("Email"), egui::accesskit::Role::TextInput);
}

#[test]
fn a_click_on_the_text_does_what_a_click_on_the_control_does() {
    let mut window = Window::new();

    assert_eq!(
        reports(&window.click("I agree")),
        vec![("h-agree".to_string(), Some(serde_json::json!(true)))]
    );
    assert_eq!(
        reports(&window.click("Pro")),
        vec![("h-pro".to_string(), Some(serde_json::json!("pro")))]
    );
}

#[test]
fn a_click_on_the_text_of_a_field_puts_the_cursor_in_the_field() {
    let mut window = Window::new();

    assert_eq!(
        reports(&window.click("Email")),
        vec![("h-focus".to_string(), None)]
    );
}
