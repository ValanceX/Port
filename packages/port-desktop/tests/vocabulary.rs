//! The vocabulary is data, and the window draws exactly what it declares.
use port_desktop::vocabulary;
use serde_json::Value;

#[test]
fn is_a_mesh_manifest_of_the_seven_components_a_newcomer_needs() {
    let manifest: Value = serde_json::from_str(vocabulary::JSON).expect("JSON");

    assert_eq!(manifest["version"], 1);
    assert_eq!(vocabulary::components().len(), 7);

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
fn names_are_one_lowercase_word_each_and_events_are_four_verbs_click_change_submit_and_cancel() {
    let manifest: Value = serde_json::from_str(vocabulary::JSON).unwrap();

    for (name, each) in manifest["components"].as_object().unwrap() {
        assert!(name.chars().all(|c| c.is_ascii_lowercase()), "{name}");
        for event in each["events"].as_object().unwrap().keys() {
            // `click` (a press), `change` (a value changed, carrying it) `submit` (a text field's Enter: done typing) and `cancel` (its Escape: backing out). A fifth is a decision, not an addition.
            assert!(
                ["click", "change", "submit", "cancel"].contains(&event.as_str()),
                "{name}.{event}"
            );
        }
    }
}

#[test]
fn the_content_layer_is_what_markdown_produces_and_is_named_as_aria_names_it() {
    // The Valance content model has six blocks and five inlines; each has a WAI-ARIA role of the same meaning (heading, paragraph, list and listitem, code, blockquote, img, strong, emphasis, link).
    let mut content = vocabulary::content_components();

    content.sort();
    assert_eq!(
        content,
        [
            "blockquote",
            "code",
            "emphasis",
            "image",
            "link",
            "list",
            "listitem",
            "paragraph",
            "strong"
        ]
    );
    // `heading` is in the controls-and-layout file (a screen has titles too), with an optional level; nothing is in both files.
    assert!(vocabulary::components().contains(&"heading".to_string()));
    assert!(vocabulary::content_components()
        .iter()
        .all(|name| !vocabulary::components().contains(name)));
}

#[cfg(feature = "window")]
#[test]
fn the_window_draws_every_content_component_content_json_declares_and_no_other() {
    let mut declared = vocabulary::content_components();
    let mut realized: Vec<String> = port_desktop::view::REALIZED_CONTENT
        .iter()
        .map(|name| name.to_string())
        .collect();

    declared.sort();
    realized.sort();
    assert_eq!(declared, realized);
}

#[cfg(feature = "window")]
#[test]
fn the_window_draws_a_whole_content_page_from_real_mesh_output_without_a_display() {
    use port_desktop::{
        port::Port,
        tree::Tree,
        view::{Output, View},
    };

    let context = egui::Context::default();
    let mut view = View::default();
    let text = std::fs::read_to_string(format!(
        "{}/tests/fixtures/reader-index.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap();
    let mut port = Port::new();

    port.draw(serde_json::from_str::<Tree>(&text).unwrap())
        .unwrap();

    let mut out: Vec<Output> = Vec::new();
    let output = context.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| {
            view.show(ui, &port.tree().unwrap().root, &mut out)
        });
    });

    assert!(!output.shapes.is_empty());
    assert!(
        out.is_empty(),
        "drawing reports nothing; only a person does"
    );
}

#[test]
fn the_page_uses_only_components_the_two_files_declare() {
    use port_desktop::{
        port::Port,
        tree::{Node, Tree},
    };

    fn names(node: &Node, into: &mut std::collections::BTreeSet<String>) {
        if let Node::Node {
            component,
            children,
            ..
        } = node
        {
            into.insert(component.clone());
            children.iter().for_each(|child| names(child, into));
        }
    }

    let text = std::fs::read_to_string(format!(
        "{}/tests/fixtures/reader-index.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap();
    let tree: Tree = serde_json::from_str(&text).unwrap();
    let mut used = std::collections::BTreeSet::new();

    Port::new().draw(tree.clone()).unwrap();
    names(&tree.root, &mut used);

    let known: Vec<String> = vocabulary::components()
        .into_iter()
        .chain(vocabulary::content_components())
        .collect();

    assert!(
        used.iter().all(|name| known.contains(name)),
        "unknown: {:?}",
        used.iter()
            .filter(|name| !known.contains(name))
            .collect::<Vec<_>>()
    );
    // A content site draws with 4 controls-and-layout words and the ten content words, and no more.
    assert_eq!(used.len(), 13, "{used:?}");
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
