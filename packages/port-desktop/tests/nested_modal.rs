//! One modal layer at a time (decision I29): a dialog inside a dialog is refused by `draw` and `update` with a stable code and a message that names both, and nothing changes. A dialog next to a
//! dialog, and a popover inside a dialog, are fine.
use port_desktop::port::{Port, PortError};
use port_desktop::tree::Tree;
use serde_json::{json, Value};

fn dialog(key: &str, children: Vec<Value>) -> Value {
    json!({"type": "node", "key": key, "component": "dialog", "props": {"open": true, "label": key}, "events": {}, "children": children})
}

fn popover(key: &str) -> Value {
    json!({"type": "node", "key": key, "component": "popover", "props": {"open": true}, "events": {}, "children": []})
}

fn tree(children: Vec<Value>) -> Tree {
    serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "page", "component": "column", "props": {}, "events": {}, "children": children}})).unwrap()
}

#[test]
fn a_dialog_inside_a_dialog_is_refused_by_draw_and_by_update_and_changes_nothing() {
    let nested = tree(vec![dialog("outer", vec![dialog("inner", vec![])])]);
    let mut port = Port::new();
    let error = port.draw(nested.clone()).unwrap_err();

    assert_eq!(error.code(), "nested-modal");
    assert_eq!(
        error,
        PortError::NestedModal {
            inner: "inner".into(),
            outer: "outer".into()
        }
    );
    assert!(error
        .to_string()
        .contains("the dialog inner is inside the dialog outer"));
    assert!(port.tree().is_none(), "nothing was drawn");

    port.draw(tree(vec![dialog("outer", vec![])])).unwrap();
    assert_eq!(port.update(nested).unwrap_err().code(), "nested-modal");
    assert_eq!(port.counts(), (1, 0), "the refused update changed nothing");
}

#[test]
fn it_finds_the_inner_dialog_however_deep_it_is() {
    let deep = tree(vec![dialog(
        "outer",
        vec![
            json!({"type": "node", "key": "box", "component": "column", "props": {}, "events": {}, "children": [dialog("inner", vec![])]}),
        ],
    )]);

    assert_eq!(Port::new().draw(deep).unwrap_err().code(), "nested-modal");
}

#[test]
fn two_dialogs_side_by_side_and_a_popover_inside_a_dialog_are_not_nested_modals() {
    let mut port = Port::new();

    port.draw(tree(vec![
        dialog("a", vec![popover("p")]),
        dialog("b", vec![]),
    ]))
    .unwrap();
}
