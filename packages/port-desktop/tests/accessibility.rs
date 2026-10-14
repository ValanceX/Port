//! A control has an accessible name. A checkbox has no text of its own and a field's hint is not a name, so a template gives them a `label`; the window passes it to the platform's accessibility
//! tree (egui's AccessKit output). This draws a tree with no window and reads the tree back.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree() -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "c", "component": "column", "props": {}, "events": {}, "children": [
            { "type": "node", "key": "a", "component": "checkbox", "props": { "checked": true, "label": "Done" }, "events": {}, "children": [] },
            { "type": "node", "key": "b", "component": "textfield", "props": { "value": "", "label": "New item" }, "events": {}, "children": [] },
            { "type": "node", "key": "d", "component": "button", "props": { "label": "Add a new item" }, "events": {}, "children": [
                { "type": "text", "key": "t", "text": "Add" } ] }
        ] }
    }))
    .expect("a render-v1 tree")
}

#[test]
fn a_controls_label_is_its_accessible_name() {
    let ctx = egui::Context::default();

    ctx.enable_accesskit();

    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();
    let tree = tree();
    let full = ctx.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    });
    let update = full
        .platform_output
        .accesskit_update
        .expect("the accessibility tree");
    let names: Vec<String> = update
        .nodes
        .iter()
        .filter_map(|(_, node)| node.label().map(str::to_owned))
        .collect();

    for expected in ["Done", "New item", "Add a new item"] {
        assert!(
            names.iter().any(|name| name == expected),
            "{expected} is not a name in {names:?}"
        );
    }
}
