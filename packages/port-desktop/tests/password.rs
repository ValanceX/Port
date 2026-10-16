//! `kind="password"` masks what a text field shows; every other kind, and a kind this window does not know, shows the text.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn shown(props: serde_json::Value) -> Vec<String> {
    let tree: Tree = serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "f", "component": "textfield", "props": props, "events": {}, "children": [] }
    }))
    .expect("a render-v1 tree");
    let ctx = egui::Context::default();
    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();
    let full = ctx.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    });
    let mut texts = Vec::new();

    fn walk(shape: &egui::Shape, texts: &mut Vec<String>) {
        match shape {
            egui::Shape::Text(text) => texts.push(text.galley.text().to_owned()),
            egui::Shape::Vec(each) => each.iter().for_each(|shape| walk(shape, texts)),
            _ => {}
        }
    }

    for clipped in &full.shapes {
        walk(&clipped.shape, &mut texts);
    }

    texts
}

#[test]
fn a_password_is_drawn_masked() {
    let texts =
        shown(serde_json::json!({ "value": "hunter2", "kind": "password", "label": "Password" }));

    assert!(
        !texts.iter().any(|text| text.contains("hunter2")),
        "{texts:?}"
    );
    assert!(
        texts.iter().any(|text| text.contains('\u{2022}')),
        "{texts:?}"
    );
}

#[test]
fn any_other_kind_is_drawn_as_the_text_it_is() {
    for kind in [
        "text",
        "email",
        "number",
        "search",
        "tel",
        "url",
        "unheard-of",
    ] {
        let texts =
            shown(serde_json::json!({ "value": "hunter2", "kind": kind, "label": "Field" }));

        assert!(
            texts.iter().any(|text| text.contains("hunter2")),
            "{kind}: {texts:?}"
        );
    }

    let none = shown(serde_json::json!({ "value": "hunter2", "label": "Field" }));

    assert!(none.iter().any(|text| text.contains("hunter2")), "{none:?}");
}
