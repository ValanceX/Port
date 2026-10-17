//! A static table: rows and columns with header meaning. Drawn with no window; the accessibility tree is read back for the roles, the counts and indices, the sort direction and the text.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::json;

fn node(
    key: &str,
    component: &str,
    props: serde_json::Value,
    children: Vec<serde_json::Value>,
) -> serde_json::Value {
    json!({ "type": "node", "key": key, "component": component, "props": props, "events": {}, "children": children })
}

fn text(text: &str) -> serde_json::Value {
    json!({ "type": "text", "key": text, "text": text })
}

fn tree() -> Tree {
    let row = |key: &str, cells: Vec<serde_json::Value>| node(key, "tablerow", json!({}), cells);
    let header = |key: &str, name: &str, props: serde_json::Value| {
        node(key, "columnheader", props, vec![text(name)])
    };
    let cell = |key: &str, value: &str| node(key, "cell", json!({}), vec![text(value)]);

    serde_json::from_value(json!({
        "format": "mesh-render", "version": 1,
        "root": node("c", "column", json!({}), vec![
            node("t", "table", json!({ "label": "Orders" }), vec![
                node("h", "tablehead", json!({}), vec![
                    row("hr", vec![header("h1", "Order", json!({ "sort": "ascending" })), header("h2", "Customer", json!({})), header("h3", "Total", json!({}))])
                ]),
                node("b", "tablebody", json!({}), vec![
                    row("r1", vec![cell("a1", "1"), cell("a2", "Ada"), cell("a3", "40")]),
                    row("r2", vec![cell("b1", "2"), node("b2", "rowheader", json!({}), vec![text("Grace")]), cell("b3", "75")])
                ])
            ])
        ])
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

    fn tree_of(&mut self) -> egui::accesskit::TreeUpdate {
        self.frame(vec![]).1
    }
}

fn window() -> Window {
    Window::new()
}

#[test]
fn the_table_its_rows_and_its_cells_are_in_the_accessibility_tree_with_counts_and_indices() {
    use egui::accesskit::Role;

    let update = window().tree_of();
    let nodes: Vec<&egui::accesskit::Node> = update.nodes.iter().map(|(_, node)| node).collect();
    let table = nodes
        .iter()
        .find(|node| node.role() == Role::Table)
        .expect("a table");

    assert_eq!(table.label(), Some("Orders"));
    assert_eq!(table.row_count(), Some(3));
    assert_eq!(table.column_count(), Some(3));
    assert_eq!(table.children().len(), 3, "its rows");

    let places = |role: Role| -> Vec<(usize, usize)> {
        let mut found: Vec<(usize, usize)> = nodes
            .iter()
            .filter(|node| node.role() == role)
            .map(|node| (node.row_index().unwrap(), node.column_index().unwrap()))
            .collect();

        found.sort();
        found
    };

    assert_eq!(places(Role::ColumnHeader), vec![(0, 0), (0, 1), (0, 2)]);
    assert_eq!(places(Role::RowHeader), vec![(2, 1)]);
    assert_eq!(
        places(Role::Cell),
        vec![(1, 0), (1, 1), (1, 2), (2, 0), (2, 2)]
    );
    assert_eq!(
        nodes.iter().filter(|node| node.role() == Role::Row).count(),
        3
    );
}

#[test]
fn a_sorted_column_says_which_way() {
    use egui::accesskit::{Role, SortDirection};

    let update = window().tree_of();
    let sorted: Vec<(usize, SortDirection)> = update
        .nodes
        .iter()
        .map(|(_, node)| node)
        .filter(|node| node.role() == Role::ColumnHeader)
        .filter_map(|node| {
            node.sort_direction()
                .map(|direction| (node.column_index().unwrap(), direction))
        })
        .collect();

    assert_eq!(sorted, vec![(0, SortDirection::Ascending)]);
}

#[test]
fn every_cells_text_is_drawn() {
    let update = window().tree_of();
    let shown: Vec<String> = update
        .nodes
        .iter()
        .filter_map(|(_, node)| node.value().or_else(|| node.label()).map(str::to_owned))
        .collect();

    for expected in [
        "Order", "Customer", "Total", "1", "Ada", "40", "2", "Grace", "75",
    ] {
        assert!(
            shown.iter().any(|text| text == expected),
            "{expected} in {shown:?}"
        );
    }
}

#[test]
fn a_table_with_no_rows_draws_and_is_empty() {
    use egui::accesskit::Role;

    let mut window = Window::new();

    window.tree = serde_json::from_value(json!({
        "format": "mesh-render", "version": 1,
        "root": node("t", "table", json!({}), vec![])
    }))
    .expect("a tree");

    let update = window.tree_of();
    let table = update
        .nodes
        .iter()
        .map(|(_, node)| node)
        .find(|node| node.role() == Role::Table)
        .expect("a table");

    assert_eq!(table.row_count(), Some(0));
    assert_eq!(table.column_count(), Some(0));
}
