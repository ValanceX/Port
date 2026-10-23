//! The ARIA Authoring Practices modal dialog keys, as generated vectors (`overlays/dialog-modal.vectors.json`, written by `scripts/generate-overlay-vectors.mjs`), run against the Desktop PORT's dialog
//! in headless egui frames with real key events. The pattern is the reference for the keys only; what is looked at is the accessibility tree the window gives: which node has focus, whether the
//! dialog is modal and named, and what the PORT reported.
#![cfg(feature = "window")]

use port_desktop::port::Report;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};
use std::path::PathBuf;

fn vectors() -> Value {
    let path =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../overlays/dialog-modal.vectors.json");

    serde_json::from_str(&std::fs::read_to_string(path).expect("the vectors")).expect("JSON")
}

fn button(key: &str, label: &str) -> Value {
    json!({"type": "node", "key": key, "component": "button", "props": {"label": label}, "events": {"click": format!("click-{label}")}, "children": []})
}

struct Scenario {
    tabbables: usize,
    open: bool,
    opener: bool,
}

impl Scenario {
    fn tree(&self) -> Tree {
        let inside: Vec<Value> = (1..=self.tabbables)
            .map(|n| button(&format!("d{n}"), &format!("d{n}")))
            .collect();
        let mut page = Vec::new();

        if self.opener {
            page.push(button("opener", "opener"));
        }

        page.push(button("elsewhere", "elsewhere"));
        page.push(json!({"type": "node", "key": "dialog", "component": "dialog", "props": {"open": self.open, "label": "Dialog"}, "events": {"dismiss": "dismiss"}, "children": inside}));

        serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "page", "component": "column", "props": {}, "events": {}, "children": page}})).unwrap()
    }
}

struct Window {
    ctx: egui::Context,
    view: View,
    /// What was reported, as the vectors name it (`dismiss:escape`).
    reported: Vec<String>,
    /// The frame's accessibility update, last.
    last: Option<egui::accesskit::TreeUpdate>,
}

impl Window {
    fn new() -> Window {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();

        Window {
            ctx,
            view: View::default(),
            reported: Vec::new(),
            last: None,
        }
    }

    fn frame(
        &mut self,
        tree: &Tree,
        events: Vec<egui::Event>,
        modifiers: egui::Modifiers,
    ) -> Vec<Report> {
        let mut out: Vec<Output> = Vec::new();
        let view = &mut self.view;
        let update = self
            .ctx
            .run(
                egui::RawInput {
                    events,
                    modifiers,
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

        self.last = Some(update);

        out.into_iter()
            .filter_map(|output| match output {
                Output::Report(report) => Some(report),
                Output::Link(_) => None,
            })
            .collect()
    }

    /// Frames of the same tree with nothing happening, so what was asked for settles.
    fn settle(&mut self, tree: &Tree) -> Vec<Report> {
        (0..3)
            .flat_map(|_| self.frame(tree, vec![], egui::Modifiers::NONE))
            .collect()
    }

    fn focused(&self) -> String {
        let update = self.last.as_ref().unwrap();

        update
            .nodes
            .iter()
            .find(|(id, _)| *id == update.focus)
            .and_then(|(_, node)| node.label().map(str::to_owned))
            .unwrap_or_else(|| "nothing".to_owned())
    }

    fn node(&self, role: egui::accesskit::Role) -> Option<&egui::accesskit::Node> {
        self.last
            .as_ref()
            .unwrap()
            .nodes
            .iter()
            .map(|(_, node)| node)
            .find(|node| node.role() == role)
    }
}

fn key_events(press: &str) -> (Vec<egui::Event>, egui::Modifiers) {
    let (key, shift) = match press {
        "Tab" => (egui::Key::Tab, false),
        "Shift+Tab" => (egui::Key::Tab, true),
        "Escape" => (egui::Key::Escape, false),
        other => panic!("a key the vectors do not use: {other}"),
    };
    let modifiers = egui::Modifiers {
        shift,
        ..Default::default()
    };

    (
        vec![egui::Event::Key {
            key,
            physical_key: Some(key),
            pressed: true,
            repeat: false,
            modifiers,
        }],
        modifiers,
    )
}

fn run(vector: &Value) {
    let name = vector["name"].as_str().unwrap();
    let ignores = vector["app"]["ignores"].as_bool().unwrap_or(false);
    let mut scenario = Scenario {
        tabbables: vector["layout"]["tabbables"].as_u64().unwrap() as usize,
        open: false,
        opener: true,
    };
    let mut window = Window::new();

    window.settle(&scenario.tree());

    for (index, step) in vector["steps"].as_array().unwrap().iter().enumerate() {
        let at = format!(
            "{name}, step {} ({})",
            index + 1,
            vector["apg"].as_str().unwrap()
        );

        if let Some(focus) = step["focus"].as_str() {
            window.view.focus(focus);
            window.settle(&scenario.tree());
        }

        if let Some(open) = step["open"].as_bool() {
            scenario.open = open;
            window.reported.clear();
            window.settle(&scenario.tree());
        }

        if step["remove"].as_str() == Some("opener") {
            scenario.opener = false;
            window.settle(&scenario.tree());
        }

        if let Some(press) = step["press"].as_str() {
            // the key goes in, and a frame later (the toolkit moves focus backwards a frame late) the application has answered
            let (events, modifiers) = key_events(press);
            let mut reports = window.frame(&scenario.tree(), events, modifiers);

            reports.extend(window.settle(&scenario.tree()));

            for report in reports {
                window.reported.push(format!(
                    "{}:{}",
                    report.handler,
                    report
                        .payload
                        .as_ref()
                        .and_then(Value::as_str)
                        .unwrap_or("")
                ));

                if !ignores {
                    scenario.open = false;
                }
            }

            window.settle(&scenario.tree());
        }

        let expect = &step["expect"];

        if let Some(focused) = expect["focused"].as_str() {
            assert_eq!(window.focused(), focused, "{at}");
        }

        if let Some(inside) = expect["focusedIn"].as_array() {
            let names: Vec<&str> = inside.iter().filter_map(Value::as_str).collect();

            assert!(
                names.contains(&window.focused().as_str()),
                "{at}: focus is on {}, not one of {names:?}",
                window.focused()
            );
        }

        if let Some(open) = expect["open"].as_bool() {
            assert_eq!(scenario.open, open, "{at}");
        }

        if let Some(modal) = expect["modal"].as_bool() {
            let dialog = window.node(egui::accesskit::Role::Dialog);

            assert_eq!(dialog.is_some_and(|node| node.is_modal()), modal, "{at}");
        }

        if let Some(label) = expect["name"].as_str() {
            assert_eq!(
                window
                    .node(egui::accesskit::Role::Dialog)
                    .and_then(|node| node.label()),
                Some(label),
                "{at}"
            );
        }

        if let Some(reported) = expect["reported"].as_array() {
            let wanted: Vec<&str> = reported.iter().filter_map(Value::as_str).collect();

            assert_eq!(window.reported, wanted, "{at}");
        }
    }
}

#[test]
fn the_apg_modal_dialog_keys_as_vectors() {
    let all = vectors();
    let list = all["vectors"].as_array().unwrap();

    assert_eq!(list.len(), 33);

    let mut failing = Vec::new();

    for vector in list {
        if std::panic::catch_unwind(|| run(vector)).is_err() {
            failing.push(vector["name"].as_str().unwrap().to_owned());
        }
    }

    assert!(
        failing.is_empty(),
        "the vectors that do not pass: {failing:?}"
    );
}
