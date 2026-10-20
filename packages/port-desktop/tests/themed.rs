//! The theme in the window: what the toolkit draws for each primitive of the portable core when the engine has given it the default theme (the fixture is what `@valancex/style` resolves for it).
//! Drawn with no display; the shapes the toolkit paints and the accessibility tree's bounds are read back, and compared with the points the theme says. The same test with the theme dropped
//! (or a value changed) must see the difference, so each case also shows its comparison failing against the toolkit's own look.
#![cfg(feature = "window")]

use egui::epaint::Shape;
use port_desktop::theme::Theme;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use std::sync::Arc;

fn theme() -> Arc<Theme> {
    Arc::new(
        Theme::parse(
            serde_json::from_str(include_str!("fixtures/theme-default.json")).expect("JSON"),
        )
        .expect("a theme"),
    )
}

fn tree(json: serde_json::Value) -> Tree {
    serde_json::from_value(serde_json::json!({"format": "mesh-render", "version": 1, "root": json}))
        .expect("a render-v1 tree")
}

fn node(
    key: &str,
    component: &str,
    props: serde_json::Value,
    children: Vec<serde_json::Value>,
) -> serde_json::Value {
    serde_json::json!({"type": "node", "key": key, "component": component, "props": props, "events": {}, "children": children})
}

fn text(key: &str, value: &str) -> serde_json::Value {
    serde_json::json!({"type": "text", "key": key, "text": value})
}

struct Drawn {
    shapes: Vec<Shape>,
    update: egui::accesskit::TreeUpdate,
}

fn flatten(shape: &Shape, into: &mut Vec<Shape>) {
    match shape {
        Shape::Vec(inner) => inner.iter().for_each(|each| flatten(each, into)),
        other => into.push(other.clone()),
    }
}

/// Draws the tree in a 700-point window, light or dark, with or without the theme.
fn draw(tree: &Tree, themed: bool, dark: bool) -> Drawn {
    let ctx = egui::Context::default();
    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();

    ctx.enable_accesskit();
    ctx.set_visuals(if dark {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    });
    view.set_theme(themed.then(theme));

    let mut input = egui::RawInput {
        time: Some(0.0),
        ..Default::default()
    };

    input.screen_rect = Some(egui::Rect::from_min_size(
        egui::Pos2::ZERO,
        egui::vec2(700.0, 500.0),
    ));

    // two frames, so the layout has settled
    let _settled = ctx.run(input.clone(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    });

    input.time = Some(0.1);
    let full = ctx.run(input, |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    });

    let mut shapes = Vec::new();

    full.shapes
        .iter()
        .for_each(|clipped| flatten(&clipped.shape, &mut shapes));

    Drawn {
        shapes,
        update: full
            .platform_output
            .accesskit_update
            .expect("the accessibility tree"),
    }
}

fn rects(drawn: &Drawn) -> Vec<&egui::epaint::RectShape> {
    drawn
        .shapes
        .iter()
        .filter_map(|shape| match shape {
            Shape::Rect(rect) => Some(rect),
            _ => None,
        })
        .collect()
}

fn rgba(hex: &str) -> egui::Color32 {
    let [r, g, b, a] = port_desktop::theme::color(hex).expect("a color");

    egui::Color32::from_rgba_unmultiplied(r, g, b, a)
}

/// The colors the text drawn in the window is painted with, by the text.
fn text_colors(drawn: &Drawn, word: &str) -> Vec<egui::Color32> {
    drawn
        .shapes
        .iter()
        .filter_map(|shape| match shape {
            Shape::Text(text) if text.galley.job.text.contains(word) => {
                Some(text.galley.job.sections[0].format.color)
            }
            _ => None,
        })
        .collect()
}

fn font_sizes(drawn: &Drawn, word: &str) -> Vec<f32> {
    drawn
        .shapes
        .iter()
        .filter_map(|shape| match shape {
            Shape::Text(text) if text.galley.job.text.contains(word) => {
                Some(text.galley.job.sections[0].format.font_id.size)
            }
            _ => None,
        })
        .collect()
}

fn bounds(drawn: &Drawn, name: &str) -> egui::accesskit::Rect {
    drawn
        .update
        .nodes
        .iter()
        .find(|(_, node)| node.label() == Some(name) || node.value() == Some(name))
        .and_then(|(_, node)| node.bounds())
        .unwrap_or_else(|| panic!("no node named {name}"))
}

#[test]
fn a_primary_button_is_the_accent_with_the_themes_radius_and_the_text_on_it() {
    let button = tree(node(
        "c",
        "column",
        serde_json::json!({}),
        vec![node(
            "b",
            "button",
            serde_json::json!({"intent": "primary"}),
            vec![text("t", "Save")],
        )],
    ));
    let themed = draw(&button, true, false);

    assert!(
        rects(&themed)
            .iter()
            .any(|rect| rect.fill == rgba("#4a2fc0")
                && rect.corner_radius == egui::CornerRadius::same(8)),
        "the accent, rounded by radius.2"
    );
    assert_eq!(text_colors(&themed, "Save"), vec![rgba("#ffffff")]);
    assert_eq!(font_sizes(&themed, "Save"), vec![15.0]);

    // shown failing: without the theme the toolkit's own button is not the accent
    let plain = draw(&button, false, false);

    assert!(!rects(&plain)
        .iter()
        .any(|rect| rect.fill == rgba("#4a2fc0")));
}

#[test]
fn the_default_intent_applies_when_the_template_says_none_and_dark_mode_has_its_own_colors() {
    let button = tree(node(
        "c",
        "column",
        serde_json::json!({}),
        vec![node(
            "b",
            "button",
            serde_json::json!({}),
            vec![text("t", "Open")],
        )],
    ));

    assert_eq!(
        text_colors(&draw(&button, true, false), "Open"),
        vec![rgba("#1d2330")]
    );
    assert_eq!(
        text_colors(&draw(&button, true, true), "Open"),
        vec![rgba("#e8eaf1")]
    );
    assert!(rects(&draw(&button, true, false))
        .iter()
        .any(|rect| rect.fill == rgba("#ffffff")));
    assert!(rects(&draw(&button, true, true))
        .iter()
        .any(|rect| rect.fill == rgba("#12141b")));
}

#[test]
fn a_size_changes_the_buttons_padding() {
    let sized = |size: &str| {
        tree(node(
            "c",
            "column",
            serde_json::json!({}),
            vec![node(
                "b",
                "button",
                serde_json::json!({"size": size}),
                vec![text("t", "Go")],
            )],
        ))
    };
    let width = |size: &str| {
        let drawn = draw(&sized(size), true, false);
        let b = bounds(&drawn, "Go");

        b.x1 - b.x0
    };

    // padding.x is 12 (sm), 16 (md), 32 (lg): the button is that much wider on each side
    assert!(
        (width("lg") - width("md") - 32.0).abs() < 0.5,
        "lg is 2 x (32 - 16) wider than md"
    );
    assert!(
        (width("md") - width("sm") - 8.0).abs() < 0.5,
        "md is 2 x (16 - 12) wider than sm"
    );
}

#[test]
fn a_column_and_a_row_are_spaced_by_the_themes_gap() {
    let column = |themed: bool| {
        let t = tree(node(
            "c",
            "column",
            serde_json::json!({}),
            vec![
                node("a", "text", serde_json::json!({}), vec![text("ta", "One")]),
                node("b", "text", serde_json::json!({}), vec![text("tb", "Two")]),
            ],
        ));
        let drawn = draw(&t, themed, false);

        bounds(&drawn, "Two").y0 - bounds(&drawn, "One").y1
    };
    let row = |themed: bool| {
        let t = tree(node(
            "r",
            "row",
            serde_json::json!({}),
            vec![
                node("a", "text", serde_json::json!({}), vec![text("ta", "One")]),
                node("b", "text", serde_json::json!({}), vec![text("tb", "Two")]),
            ],
        ));
        let drawn = draw(&t, themed, false);

        bounds(&drawn, "Two").x0 - bounds(&drawn, "One").x1
    };

    assert!(
        (column(true) - 12.0).abs() < 0.5,
        "space.3 between the rows of a column: {}",
        column(true)
    );
    assert!(
        (row(true) - 8.0).abs() < 0.5,
        "space.2 between the items of a row: {}",
        row(true)
    );
    // shown failing: the toolkit's own spacing is not the theme's
    assert!((column(false) - 12.0).abs() > 1.0);
}

#[test]
fn a_heading_and_text_are_the_themes_size_color_and_weight() {
    let page = tree(node(
        "c",
        "column",
        serde_json::json!({}),
        vec![
            node(
                "h",
                "heading",
                serde_json::json!({"level": 1}),
                vec![text("th", "Title")],
            ),
            node(
                "p",
                "text",
                serde_json::json!({}),
                vec![text("tp", "Words")],
            ),
        ],
    ));
    let drawn = draw(&page, true, false);

    assert_eq!(font_sizes(&drawn, "Title"), vec![24.0]);
    assert_eq!(font_sizes(&drawn, "Words"), vec![16.0]);
    assert_eq!(text_colors(&drawn, "Title"), vec![rgba("#1d2330")]);
    // the toolkit's own heading is 26 points, whatever the level
    assert_eq!(font_sizes(&draw(&page, false, false), "Title"), vec![26.0]);
}

#[test]
fn a_text_field_has_the_themes_fill_border_and_radius_and_an_invalid_one_the_wider_danger_border() {
    let field = |invalid: bool| {
        tree(node(
            "c",
            "column",
            serde_json::json!({}),
            vec![node(
                "f",
                "textfield",
                serde_json::json!({"value": "x", "label": "Name", "invalid": invalid}),
                vec![],
            )],
        ))
    };
    let themed = draw(&field(false), true, false);
    let rect = rects(&themed)
        .into_iter()
        .find(|rect| {
            rect.fill == rgba("#ffffff") && rect.corner_radius == egui::CornerRadius::same(8)
        })
        .expect("the field's frame");

    assert_eq!(rect.stroke, egui::Stroke::new(1.0_f32, rgba("#6b7385")));

    let invalid = draw(&field(true), true, false);

    assert!(
        rects(&invalid)
            .iter()
            .any(|rect| rect.stroke == egui::Stroke::new(2.0_f32, rgba("#b3261e"))),
        "border.2 in the danger color"
    );
}

#[test]
fn a_theme_the_window_was_not_given_changes_nothing() {
    let page = tree(node(
        "c",
        "column",
        serde_json::json!({}),
        vec![node(
            "b",
            "button",
            serde_json::json!({"intent": "danger"}),
            vec![text("t", "Delete")],
        )],
    ));

    assert!(!rects(&draw(&page, false, false))
        .iter()
        .any(|rect| rect.fill == rgba("#b3261e")));
    assert!(rects(&draw(&page, true, false))
        .iter()
        .any(|rect| rect.fill == rgba("#b3261e")));
}
