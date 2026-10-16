//! A choice group: `radiogroup` names the group and holds the options, `radio` is one option. Choosing an option that is not the selected one reports `select` with its value; choosing the selected
//! one reports nothing. The group and the options are in the accessibility tree with their roles, names and selected state. Drawn with no window; the options are found in the tree and clicked.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree() -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "c", "component": "column", "props": {}, "events": {}, "children": [
            { "type": "node", "key": "g", "component": "radiogroup", "props": { "label": "Plan" }, "events": {}, "children": [
                { "type": "node", "key": "a", "component": "radio", "props": { "checked": true, "value": "free", "label": "Free" }, "events": { "select": "h-free" }, "children": [] },
                { "type": "node", "key": "b", "component": "radio", "props": { "checked": false, "value": "pro", "label": "Pro" }, "events": { "select": "h-pro" }, "children": [] },
                { "type": "node", "key": "d", "component": "radio", "props": { "checked": false, "value": "team", "label": "Team", "disabled": true }, "events": { "select": "h-team" }, "children": [] }
            ] }
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
            .find(|(_, node)| {
                node.label() == Some(name) && node.role() == egui::accesskit::Role::RadioButton
            })
            .and_then(|(_, node)| node.bounds())
            .unwrap_or_else(|| panic!("no radio named {name}"));

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

fn selects(out: &[Output]) -> Vec<(String, Option<serde_json::Value>)> {
    out.iter()
        .filter_map(|output| match output {
            Output::Report(report) => Some((report.handler.clone(), report.payload.clone())),
            _ => None,
        })
        .collect()
}

#[test]
fn the_group_and_its_options_are_in_the_accessibility_tree_with_their_roles_names_and_state() {
    let (_, update) = Window::new().frame(vec![]);
    let find = |name: &str| {
        update
            .nodes
            .iter()
            .map(|(_, node)| node)
            .find(|node| node.label() == Some(name))
            .unwrap_or_else(|| panic!("no control named {name}"))
    };

    assert_eq!(find("Plan").role(), egui::accesskit::Role::RadioGroup);
    assert_eq!(find("Free").role(), egui::accesskit::Role::RadioButton);
    assert_eq!(find("Free").toggled(), Some(egui::accesskit::Toggled::True));
    assert_eq!(find("Pro").toggled(), Some(egui::accesskit::Toggled::False));
    assert!(find("Team").is_disabled());
}

#[test]
fn choosing_another_option_reports_select_with_its_value() {
    let mut window = Window::new();

    assert_eq!(
        selects(&window.click("Pro")),
        vec![("h-pro".to_string(), Some(serde_json::json!("pro")))]
    );
}

#[test]
fn choosing_the_selected_option_or_a_disabled_one_reports_nothing() {
    let mut window = Window::new();

    assert_eq!(selects(&window.click("Free")), vec![]);
    assert_eq!(selects(&window.click("Team")), vec![]);
}
