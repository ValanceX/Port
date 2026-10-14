//! The PORT contract, version 1, for the Desktop PORT: draw, update, unmount, and the reports an interaction produces. The trees are real MESH output (captured from the to-do application).
use port_desktop::port::{inspect, Port, PortError};
use port_desktop::tree::Tree;
use serde_json::json;

fn fixture(name: &str) -> Tree {
    let text = std::fs::read_to_string(format!(
        "{}/tests/fixtures/{name}.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("the fixture exists");

    serde_json::from_str(&text).expect("a render-v1 tree")
}

#[test]
fn draws_a_tree_and_reads_what_is_on_screen() {
    let mut port = Port::new();

    port.draw(fixture("todo-lists")).unwrap();
    assert!(inspect::readable(&port)
        .iter()
        .any(|line| line == "Your lists"));
    assert!(inspect::buttons(&port)
        .iter()
        .any(|label| label == "Groceries (1 of 2 open)"));
}

#[test]
fn refuses_a_tree_that_is_not_render_v1_and_changes_nothing() {
    let mut port = Port::new();
    let mut other = fixture("todo-lists");

    port.draw(fixture("todo-lists")).unwrap();
    other.version = 2;

    let error = port.draw(other.clone()).unwrap_err();

    assert_eq!(error.code(), "unsupported-format");
    assert_eq!(port.update(other).unwrap_err().code(), "unsupported-format");
    assert_eq!(port.counts(), (1, 0), "a refused tree is not counted");
    assert!(
        inspect::readable(&port)
            .iter()
            .any(|line| line == "Your lists"),
        "what was drawn stays"
    );
}

#[test]
fn ignores_properties_it_does_not_know() {
    let text = std::fs::read_to_string(format!(
        "{}/tests/fixtures/todo-lists.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap();
    let mut value: serde_json::Value = serde_json::from_str(&text).unwrap();

    value["somethingNew"] = json!({ "added": "in a later version of the same format" });
    value["root"]["alsoNew"] = json!(true);

    let tree: Tree =
        serde_json::from_value(value).expect("the schema is additive within a version");

    assert!(Port::new().draw(tree).is_ok());
}

#[test]
fn update_needs_something_drawn_and_unmount_is_safe_twice() {
    let mut port = Port::new();

    assert_eq!(port.update(fixture("todo-lists")), Err(PortError::NotDrawn));
    port.unmount(); // before anything was drawn
    port.draw(fixture("todo-lists")).unwrap();
    port.unmount();
    port.unmount();
    assert!(port.tree().is_none());
    assert_eq!(
        port.update(fixture("todo-lists")),
        Err(PortError::NotDrawn),
        "after unmount, update refuses until a draw"
    );
    port.draw(fixture("todo-lists")).unwrap(); // the PORT stays usable
    assert_eq!(port.counts(), (2, 0));
}

#[test]
fn an_interaction_is_reported_as_the_trees_handler_and_the_payload_and_nothing_else() {
    let mut port = Port::new();

    port.draw(fixture("todo-lists")).unwrap();

    let click = inspect::click(&port, "Add list", 0).expect("the button is there");
    let typed = inspect::type_into(&port, "New list", "Errands").expect("the field is there");

    assert!(!click.handler.is_empty());
    assert_eq!(click.payload, None);
    assert_eq!(typed.payload, Some(json!("Errands")));
    assert_ne!(click.handler, typed.handler);
}

#[test]
fn a_checkbox_reports_its_new_value_not_a_flip() {
    let mut port = Port::new();

    port.draw(fixture("todo-list")).unwrap();

    // The sample list has Milk (not done) and Bread (done): each report is the value the box is going to, so the same report twice is the same state.
    let tick = inspect::check(&port, "Milk").expect("Milk has a checkbox in its row");
    let untick = inspect::check(&port, "Bread").expect("Bread has a checkbox in its row");

    assert_eq!(tick.payload, Some(json!(true)));
    assert_eq!(untick.payload, Some(json!(false)));
}

#[test]
fn a_disabled_button_reports_nothing_and_an_enabled_one_does() {
    let text = std::fs::read_to_string(format!(
        "{}/tests/fixtures/todo-list.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap();
    let mut port = Port::new();

    port.draw(serde_json::from_str(&text).unwrap()).unwrap();
    assert!(
        inspect::click(&port, "Clear done", 0).is_some(),
        "the sample list has a done item, so Clear done is enabled"
    );

    // The same screen with the button disabled, as the application renders it when nothing is done.
    fn disable(value: &mut serde_json::Value) {
        if value["component"] == "button" && value["children"].to_string().contains("Clear done") {
            value["props"]["disabled"] = json!(true);
        }
        if let Some(children) = value["children"].as_array_mut() {
            children.iter_mut().for_each(disable);
        }
    }

    let mut value: serde_json::Value = serde_json::from_str(&text).unwrap();

    disable(&mut value["root"]);
    port.update(serde_json::from_value(value).unwrap()).unwrap();
    assert!(inspect::click(&port, "Clear done", 0).is_none());
    assert!(inspect::click(&port, "Add item", 0).is_some());
}
