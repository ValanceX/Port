//! The vocabulary is data, and the window draws exactly what it declares.
use port_desktop::vocabulary;
use serde_json::Value;

#[test]
fn is_a_mesh_manifest_of_the_eight_components_a_newcomer_needs() {
    let manifest: Value = serde_json::from_str(vocabulary::JSON).expect("JSON");

    assert_eq!(manifest["version"], 1);
    assert_eq!(vocabulary::components().len(), 8);

    for (name, each) in manifest["components"].as_object().unwrap() {
        for part in ["props", "events", "commands", "scope"] {
            assert!(each.get(part).is_some(), "{name} declares {part}");
        }
        // A primitive is drawn by the PORT; it has no commands and reads nothing from the application's scope.
        assert!(
            each["commands"].as_object().unwrap().is_empty()
                && each["scope"].as_object().unwrap().is_empty(),
            "{name} is a primitive"
        );
    }
}

#[test]
fn names_are_one_lowercase_word_each_and_events_are_what_a_person_does() {
    let manifest: Value = serde_json::from_str(vocabulary::JSON).unwrap();

    for (name, each) in manifest["components"].as_object().unwrap() {
        assert!(name.chars().all(|c| c.is_ascii_lowercase()), "{name}");
        for event in each["events"].as_object().unwrap().keys() {
            assert!(
                ["press", "toggle", "change"].contains(&event.as_str()),
                "{name}.{event}"
            );
        }
    }
}

#[cfg(feature = "window")]
#[test]
fn the_window_draws_every_component_the_vocabulary_declares_and_no_other() {
    let mut declared = vocabulary::components();
    let mut realized: Vec<String> = port_desktop::view::REALIZED
        .iter()
        .map(|name| name.to_string())
        .collect();

    declared.sort();
    realized.sort();
    assert_eq!(declared, realized);
}

#[cfg(feature = "window")]
#[test]
fn the_window_draws_real_screens_without_a_display() {
    use port_desktop::{port::Port, tree::Tree, view::View};

    let context = egui::Context::default();
    let mut view = View::default();

    for name in ["todo-lists", "todo-list", "todo-item-edit"] {
        let text = std::fs::read_to_string(format!(
            "{}/tests/fixtures/{name}.json",
            env!("CARGO_MANIFEST_DIR")
        ))
        .unwrap();
        let tree: Tree = serde_json::from_str(&text).unwrap();
        let mut port = Port::new();

        port.draw(tree).unwrap();

        let mut reports = Vec::new();
        let output = context.run(egui::RawInput::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.show(ui, &port.tree().unwrap().root, &mut reports)
            });
        });

        assert!(!output.shapes.is_empty(), "{name} drew something");
        assert!(
            reports.is_empty(),
            "drawing reports nothing; only a person does"
        );
    }
}
