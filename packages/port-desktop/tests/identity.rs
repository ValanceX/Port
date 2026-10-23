//! Decision I16 on the screen: what the window remembers by id follows a node's key. A text field that has focus keeps it when the tree reorders its fields, and what the person typed in it
//! (its cursor and selection) stays with it; a field that is removed hands focus to nothing in particular rather than to the one that took its place.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};

fn field(key: &str) -> Value {
    json!({"type": "node", "key": key, "component": "textfield", "props": {"label": key, "value": key}, "events": {"change": format!("change-{key}")}, "children": []})
}

fn tree(keys: &[&str]) -> Tree {
    serde_json::from_value(json!({
        "format": "mesh-render", "version": 1,
        "root": {"type": "node", "key": "root", "component": "column", "props": {}, "events": {}, "children": keys.iter().map(|key| field(key)).collect::<Vec<_>>()}
    }))
    .unwrap()
}

type Fields = std::collections::BTreeMap<String, egui::Pos2>;

/// One frame (with `input`); returns the label of the node that has focus, if any, and the middle of each field by label.
fn frame_with(
    ctx: &egui::Context,
    view: &mut View,
    tree: &Tree,
    input: egui::RawInput,
) -> (Option<String>, Fields) {
    let mut out: Vec<Output> = Vec::new();
    let update = ctx
        .run(input, |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
        })
        .platform_output
        .accesskit_update
        .expect("the accessibility tree");
    let fields: Fields = update
        .nodes
        .iter()
        .filter(|(_, node)| node.role() == egui::accesskit::Role::TextInput)
        .map(|(_, node)| {
            let bounds = node.bounds().expect("a field has bounds");

            (
                node.label().unwrap().to_owned(),
                egui::pos2(
                    ((bounds.x0 + bounds.x1) / 2.0) as f32,
                    ((bounds.y0 + bounds.y1) / 2.0) as f32,
                ),
            )
        })
        .collect();
    let focused = update
        .nodes
        .iter()
        .find(|(id, _)| *id == update.focus)
        .filter(|(_, node)| node.role() == egui::accesskit::Role::TextInput)
        .map(|(_, node)| node.label().unwrap().to_owned());

    (focused, fields)
}

fn frame(ctx: &egui::Context, view: &mut View, tree: &Tree) -> (Option<String>, Fields) {
    frame_with(ctx, view, tree, egui::RawInput::default())
}

/// The person clicks at `at`: it moves there, presses and lets go, over three frames of `tree`.
fn click(ctx: &egui::Context, view: &mut View, tree: &Tree, at: egui::Pos2) {
    let pointer = |event: egui::Event| egui::RawInput {
        events: vec![event],
        ..Default::default()
    };
    let button = |pressed: bool| egui::Event::PointerButton {
        pos: at,
        button: egui::PointerButton::Primary,
        pressed,
        modifiers: egui::Modifiers::NONE,
    };

    frame_with(ctx, view, tree, pointer(egui::Event::PointerMoved(at)));
    frame_with(ctx, view, tree, pointer(button(true)));
    frame_with(ctx, view, tree, pointer(button(false)));
}

#[test]
fn focus_stays_with_the_field_when_the_fields_change_places() {
    let ctx = egui::Context::default();
    ctx.enable_accesskit();
    let mut view = View::default();

    let (_, fields) = frame(&ctx, &mut view, &tree(&["a", "b", "c"]));

    click(&ctx, &mut view, &tree(&["a", "b", "c"]), fields["b"]);

    assert_eq!(
        frame(&ctx, &mut view, &tree(&["a", "b", "c"])).0.as_deref(),
        Some("b")
    );
    assert_eq!(
        frame(&ctx, &mut view, &tree(&["c", "b", "a"])).0.as_deref(),
        Some("b"),
        "reversed"
    );
    assert_eq!(
        frame(&ctx, &mut view, &tree(&["b", "a", "c"])).0.as_deref(),
        Some("b"),
        "moved first"
    );
    assert_eq!(
        frame(&ctx, &mut view, &tree(&["x", "b", "y", "a"]))
            .0
            .as_deref(),
        Some("b"),
        "others inserted around it"
    );
}

#[test]
fn focus_does_not_pass_to_the_field_that_takes_the_place_of_one_removed() {
    let ctx = egui::Context::default();
    ctx.enable_accesskit();
    let mut view = View::default();

    let (_, fields) = frame(&ctx, &mut view, &tree(&["a", "b", "c"]));

    click(&ctx, &mut view, &tree(&["a", "b", "c"]), fields["b"]);
    assert_eq!(
        frame(&ctx, &mut view, &tree(&["a", "b", "c"])).0.as_deref(),
        Some("b")
    );

    let (focused, _) = frame(&ctx, &mut view, &tree(&["a", "c"]));

    assert_ne!(
        focused.as_deref(),
        Some("c"),
        "c is in b's place now, and is not b"
    );
}

/// A list's items and a table's rows are nodes of the accessibility tree too, and they are named by the key of the node they draw (I16), not by their place.
mod parts {
    use super::*;
    use std::collections::BTreeMap;

    fn text_of(update: &egui::accesskit::TreeUpdate, id: egui::accesskit::NodeId) -> String {
        let node = &update
            .nodes
            .iter()
            .find(|(each, _)| *each == id)
            .expect("a node")
            .1;
        let own = node.value().or(node.label()).map(str::to_owned);

        own.unwrap_or_else(|| {
            node.children()
                .iter()
                .map(|child| text_of(update, *child))
                .collect::<Vec<_>>()
                .join("")
        })
    }

    /// The node id of every node of `role`, by the text drawn in it, for a frame of `tree`.
    fn ids(
        ctx: &egui::Context,
        view: &mut View,
        tree: &Tree,
        role: egui::accesskit::Role,
    ) -> BTreeMap<String, u64> {
        let mut out: Vec<Output> = Vec::new();
        let update = ctx
            .run(egui::RawInput::default(), |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
            })
            .platform_output
            .accesskit_update
            .expect("the accessibility tree");

        update
            .nodes
            .iter()
            .filter(|(_, node)| node.role() == role)
            .map(|(id, _)| {
                (
                    text_of(&update, *id)
                        .trim()
                        .trim_start_matches(['\u{2022}', ' '])
                        .to_owned(),
                    id.0,
                )
            })
            .collect()
    }

    fn item(key: &str) -> Value {
        json!({"type": "node", "key": key, "component": "listitem", "props": {}, "events": {}, "children": [{"type": "text", "key": format!("t{key}"), "text": key}]})
    }

    fn cell(key: &str) -> Value {
        json!({"type": "node", "key": format!("c{key}"), "component": "cell", "props": {}, "events": {}, "children": [{"type": "text", "key": format!("t{key}"), "text": key}]})
    }

    fn rows(keys: &[&str]) -> Tree {
        serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "table", "component": "table", "props": {}, "events": {}, "children": [
            {"type": "node", "key": "body", "component": "tablebody", "props": {}, "events": {}, "children": keys.iter().map(|key| json!({"type": "node", "key": format!("r{key}"), "component": "tablerow", "props": {}, "events": {}, "children": [cell(key)]})).collect::<Vec<_>>()}
        ]}})).unwrap()
    }

    fn list(keys: &[&str]) -> Tree {
        serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "list", "component": "list", "props": {}, "events": {}, "children": keys.iter().map(|key| item(key)).collect::<Vec<_>>()}})).unwrap()
    }

    #[test]
    fn a_list_item_keeps_its_accessibility_node_when_the_items_change_places() {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();
        let mut view = View::default();
        let before = ids(
            &ctx,
            &mut view,
            &list(&["x", "y", "z"]),
            egui::accesskit::Role::ListItem,
        );
        let after = ids(
            &ctx,
            &mut view,
            &list(&["z", "x", "y"]),
            egui::accesskit::Role::ListItem,
        );

        assert_eq!(before.keys().collect::<Vec<_>>(), ["x", "y", "z"]);
        assert_eq!(before, after);
    }

    #[test]
    fn a_table_row_and_its_cell_keep_their_accessibility_nodes_when_the_rows_change_places() {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();
        let mut view = View::default();

        for role in [egui::accesskit::Role::Row, egui::accesskit::Role::Cell] {
            let before = ids(&ctx, &mut view, &rows(&["x", "y", "z"]), role);
            let after = ids(&ctx, &mut view, &rows(&["z", "x", "y"]), role);

            assert_eq!(
                before.keys().collect::<Vec<_>>(),
                ["x", "y", "z"],
                "{role:?}"
            );
            assert_eq!(before, after, "{role:?}");
        }
    }
}
