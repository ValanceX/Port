//! Images. The engine names a file by its absolute path; the window decodes the kinds it knows (PNG, JPEG, GIF, BMP, WebP) from the machine it runs on, and nothing else: an address on the network,
//! a vector image, a relative path or a file that is not there is drawn as its description. Either way the image has its description as its accessible name.
#![cfg(feature = "window")]

use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};

fn tree(src: &str) -> Tree {
    serde_json::from_value(serde_json::json!({
        "format": "mesh-render", "version": 1,
        "root": { "type": "node", "key": "i", "component": "image", "props": { "src": src, "label": "A red square" }, "events": {}, "children": [] }
    }))
    .expect("a render-v1 tree")
}

/// The accessibility tree of one frame: each node's role and name.
fn frame(src: &str) -> (Vec<(egui::accesskit::Role, String)>, Vec<String>) {
    let ctx = egui::Context::default();

    egui_extras::install_image_loaders(&ctx);
    ctx.enable_accesskit();

    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();
    let tree = tree(src);
    let full = ctx.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    });
    let update = full
        .platform_output
        .accesskit_update
        .expect("the accessibility tree");
    let named = update
        .nodes
        .iter()
        .filter_map(|(_, node)| {
            node.label()
                .or_else(|| node.value())
                .map(|name| (node.role(), name.to_owned()))
        })
        .collect::<Vec<_>>();
    let texts = named.iter().map(|(_, name)| name.clone()).collect();

    (named, texts)
}

#[test]
fn a_local_png_is_drawn_as_an_image_named_by_its_description() {
    let path = format!("{}/tests/fixtures/red.png", env!("CARGO_MANIFEST_DIR"));
    let (named, _) = frame(&path);

    assert!(
        named
            .iter()
            .any(|(role, name)| *role == egui::accesskit::Role::Image && name == "A red square"),
        "no image named by its description in {named:?}"
    );
}

#[test]
fn a_local_svg_is_drawn_as_an_image_too() {
    let path = format!("{}/tests/fixtures/dot.svg", env!("CARGO_MANIFEST_DIR"));
    let (named, _) = frame(&path);

    assert!(
        named
            .iter()
            .any(|(role, name)| *role == egui::accesskit::Role::Image && name == "A red square"),
        "no image named by its description in {named:?}"
    );
}

#[test]
fn what_it_cannot_decode_or_find_is_drawn_as_its_description() {
    for src in [
        "https://example.com/a.png",
        "/not/there/logo.svg",
        "relative/a.png",
        "/no/such/file.png",
    ] {
        let (named, texts) = frame(src);

        assert!(
            texts.iter().any(|text| text == "[image: A red square]"),
            "{src}: {texts:?}"
        );
        assert!(
            !named
                .iter()
                .any(|(role, _)| *role == egui::accesskit::Role::Image),
            "{src} was drawn as an image"
        );
    }
}
