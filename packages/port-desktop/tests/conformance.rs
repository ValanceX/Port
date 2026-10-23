//! MESH's conformance vectors (`@valancex/mesh-conformance`, installed by the workspace's `pnpm install`;
//! never copied into this tree: `scripts/check-conformance.mjs` fails on a copy) through the Desktop PORT, as far
//! as the Desktop can honestly be asked.
//!
//! What the Desktop can answer today:
//! - every tree of every vector is a `render-v1` tree its reader accepts, and `Port::draw` and `update` take
//!   them (values, events and identity: 42 trees);
//! - the `values` text-run case is readable on the screen (`inspect::readable`).
//!
//! What it cannot, and this file says so instead of pretending:
//! - the `values` prop cases are about a *text-only slot* (the Web PORT's attribute). The Desktop has no such
//!   slot and does not read `propText`, so there is nothing to compare;
//! - the `events` vectors are about *resolving an interaction* from a node to the nearest ancestor that binds
//!   the primitive's applicable event. The Desktop does not resolve on the tree: each egui widget reports its
//!   own handler, and the vectors' components (`card`, `row`, `label`) and events (`press`, `select`,
//!   `dismiss`) are not in its vocabulary. There is no function to run the cases against;
//! - the program vectors with steps (`snippets`, `forwarder`, `passing`) are taken as trees, and their steps are held to the
//!   same keyed-update law as the identity vectors (`program_steps_keep_identity_by_key`); `enums` is a tree it takes, and its `rejects` and `dispatches` cases are MESH's alone;
//! - the `identity` vectors need a keyed update. `identity_is_kept_by_key` runs them where the Desktop
//!   draws: each node with a handler becomes a button named by its key, two frames are drawn in one egui
//!   context, and a kept identity must have the same accessibility node id (decision I16: a widget's id
//!   comes from its node's key, not its place). Before I16, 14 of the 19 vectors failed; a control shows the
//!   comparison can fail (a different key is a different node).
#![cfg(feature = "window")]

use port_desktop::port::{inspect, Port};
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::PathBuf;

fn vectors() -> PathBuf {
    let dir = std::env::var_os("MESH_CONFORMANCE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../../node_modules/@valancex/mesh-conformance/conformance")
        });
    assert!(
        dir.join("identity/cases.json").is_file(),
        "the conformance vectors are not at {}: run `pnpm install` at the repository root (or set MESH_CONFORMANCE_DIR)",
        dir.display()
    );
    dir
}

fn json_of(path: &str) -> Value {
    serde_json::from_str(&std::fs::read_to_string(vectors().join(path)).unwrap()).unwrap()
}

fn tree_of(value: &Value) -> Tree {
    serde_json::from_value(value.clone()).expect("a render-v1 tree the reader accepts")
}

/// Every identity vector that has trees, as (name, earlier?, previous, next).
fn identity_vectors() -> Vec<(String, Option<Value>, Value, Value)> {
    ["identity/cases.json", "identity/repeat/cases.json"]
        .iter()
        .flat_map(|path| json_of(path)["vectors"].as_array().unwrap().clone())
        .filter(|vector| vector.get("previous").is_some())
        .map(|vector| {
            (
                vector["name"].as_str().unwrap().to_owned(),
                vector.get("earlier").map(|side| side["tree"].clone()),
                vector["previous"]["tree"].clone(),
                vector["next"]["tree"].clone(),
            )
        })
        .collect()
}

#[test]
fn the_reader_and_the_port_take_every_tree_of_every_vector() {
    let mut trees = vec![
        json_of("values/expected.tree.json"),
        json_of("events/expected.tree.json"),
    ];
    for (_, earlier, previous, next) in identity_vectors() {
        trees.extend(earlier);
        trees.push(previous);
        trees.push(next);
    }
    assert_eq!(trees.len(), 2 + 19 * 2 + 2, "19 identity vectors have trees (C6, C16 and C17 have none) and two each, and C8 and C21 add an earlier one");

    let mut port = Port::new();
    for value in &trees {
        let tree = tree_of(value);
        port.draw(tree.clone()).unwrap();
        port.update(tree.clone()).unwrap();
        assert_eq!(port.tree(), Some(&tree));
    }
    assert_eq!(port.counts(), (trees.len(), trees.len()));
}

#[test]
fn the_values_text_run_is_readable() {
    let cases = json_of("values/cases.json");
    let run = cases
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case.get("textRun").is_some())
        .expect("the text-run case");
    let mut port = Port::new();
    port.draw(tree_of(&json_of("values/expected.tree.json")))
        .unwrap();

    let expected = run["text"].as_str().unwrap();
    assert!(
        inspect::readable(&port).iter().any(|text| text == expected),
        "{expected:?} is not on the screen: {:?}",
        inspect::readable(&port)
    );
}

// ---------------------------------------------------------------------------------------------------------

/// The vector's tree in the Desktop's vocabulary: a node with a handler is a button named by its key (the name
/// is how the node is found again), every other node a column.
fn in_desktop_vocabulary(node: &Value) -> Value {
    if node["type"] == "text" {
        return node.clone();
    }
    let children: Vec<Value> = node["children"]
        .as_array()
        .unwrap()
        .iter()
        .map(in_desktop_vocabulary)
        .collect();
    if node["events"]
        .as_object()
        .is_some_and(|events| !events.is_empty())
    {
        let handler = node["events"].as_object().unwrap().values().next().unwrap();
        json!({"type": "node", "key": node["key"], "component": "button", "props": {"label": node["key"]}, "events": {"click": handler}, "children": children})
    } else {
        json!({"type": "node", "key": node["key"], "component": "column", "props": {}, "events": {}, "children": children})
    }
}

/// Draws `trees` one after another in one egui context, and returns each frame's accessibility node ids by name.
fn frames(trees: &[&Value]) -> Vec<BTreeMap<String, u64>> {
    let ctx = egui::Context::default();
    ctx.enable_accesskit();
    let mut view = View::default();
    trees
        .iter()
        .map(|value| {
            let tree = tree_of(&json!({"format": "mesh-render", "version": 1, "root": in_desktop_vocabulary(&value["root"])}));
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
                .filter(|(_, node)| node.role() == egui::accesskit::Role::Button)
                .map(|(id, node)| (node.label().unwrap().to_owned(), id.0))
                .collect()
        })
        .collect()
}

/// The labels (keys) of the buttons whose accessibility node id changed between two frames, though the key is in both.
fn moved(before: &BTreeMap<String, u64>, after: &BTreeMap<String, u64>) -> Vec<String> {
    before
        .iter()
        .filter(|(label, id)| after.get(*label).is_some_and(|now| now != *id))
        .map(|(label, _)| label.clone())
        .collect()
}

#[test]
fn identity_is_kept_by_key() {
    let mut failing = Vec::new();
    for (name, earlier, previous, next) in identity_vectors() {
        let all: Vec<&Value> = earlier.iter().chain([&previous, &next]).collect();
        let drawn = frames(&all);
        let (before, after) = (&drawn[drawn.len() - 2], &drawn[drawn.len() - 1]);
        // A key in both trees is a kept identity here, except where a key returns after a gap (C8, C21: the
        // earlier tree's identity is not the previous one's).
        if !moved(before, after).is_empty() {
            failing.push(name);
        }
    }
    failing.sort();
    assert!(
        failing.is_empty(),
        "the vectors in which a kept identity changed its accessibility node id: {failing:?}"
    );
}

/// The comparison can fail: the same two buttons in the same places with other keys are other nodes, and the same keys in another
/// order are the same nodes. (Before I16 the second half was the other way round: the places decided.)
#[test]
fn the_identity_comparison_tells_a_key_from_a_place() {
    let button = |key: &str| json!({"type": "node", "key": key, "component": "button", "props": {"label": key}, "events": {"click": format!("h{key}")}, "children": []});
    let column = |keys: &[&str]| json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "root", "component": "column", "props": {}, "events": {}, "children": keys.iter().map(|key| button(key)).collect::<Vec<_>>()}});
    let render = |trees: &[Value]| {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();
        let mut view = View::default();
        trees
            .iter()
            .map(|value| {
                let tree = tree_of(value);
                let mut out: Vec<Output> = Vec::new();
                let update = ctx
                    .run(egui::RawInput::default(), |ctx| {
                        egui::CentralPanel::default()
                            .show(ctx, |ui| view.show(ui, &tree.root, &mut out));
                    })
                    .platform_output
                    .accesskit_update
                    .expect("the accessibility tree");
                update
                    .nodes
                    .iter()
                    .filter(|(_, node)| node.role() == egui::accesskit::Role::Button)
                    .map(|(id, node)| (node.label().unwrap().to_owned(), id.0))
                    .collect::<BTreeMap<String, u64>>()
            })
            .collect::<Vec<_>>()
    };

    // The same keys, reordered: the same nodes.
    let drawn = render(&[column(&["a", "b", "c"]), column(&["c", "a", "b"])]);
    assert!(moved(&drawn[0], &drawn[1]).is_empty());

    // Another key in the same place: another node (the label is the key here, so compare by place).
    let other = render(&[column(&["a", "b"]), column(&["x", "y"])]);
    let ids = |frame: &BTreeMap<String, u64>| {
        frame
            .values()
            .copied()
            .collect::<std::collections::BTreeSet<_>>()
    };
    assert!(ids(&other[0]).is_disjoint(&ids(&other[1])));
}

// ---------------------------------------------------------------------------------------------------------
// The program vectors with steps (`snippets/`, `forwarder/`, `passing/`) and `enums/`: trees a renderer is given.

/// The trees of a program directory: its snapshot's, then each step's.
fn program_trees(dir: &str) -> Vec<Value> {
    let mut trees = vec![json_of(&format!("{dir}/expected.tree.json"))];
    let mut at = 1;
    while vectors()
        .join(format!("{dir}/step-{at}.expected.tree.json"))
        .is_file()
    {
        trees.push(json_of(&format!("{dir}/step-{at}.expected.tree.json")));
        at += 1;
    }
    trees
}

const PROGRAM_DIRS: [&str; 3] = ["snippets", "forwarder", "passing"];

#[test]
fn the_reader_and_the_port_take_every_tree_of_the_program_vectors() {
    let mut trees: Vec<Value> = PROGRAM_DIRS
        .iter()
        .flat_map(|dir| program_trees(dir))
        .collect();
    trees.push(json_of("enums/expected.tree.json"));
    // snippets: 4 (snapshot and 3 steps), forwarder: 3, passing: 3, and enums: 1.
    assert_eq!(trees.len(), 4 + 3 + 3 + 1);

    let mut port = Port::new();
    for value in &trees {
        let tree = tree_of(value);
        port.draw(tree.clone()).unwrap();
        port.update(tree.clone()).unwrap();
        assert_eq!(port.tree(), Some(&tree));
    }
    assert_eq!(port.counts(), (trees.len(), trees.len()));
}

#[test]
fn program_steps_keep_identity_by_key() {
    let mut failing: Vec<(String, usize, usize)> = Vec::new();
    for dir in PROGRAM_DIRS {
        let trees = program_trees(dir);
        for from in 0..trees.len() - 1 {
            let drawn = frames(&[&trees[from], &trees[from + 1]]);
            if !moved(&drawn[0], &drawn[1]).is_empty() {
                failing.push((dir.to_string(), from, from + 1));
            }
        }
    }
    assert!(
        failing.is_empty(),
        "the step transitions in which a kept key changed its accessibility node id: {failing:?}"
    );
}
