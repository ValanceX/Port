//! The interaction states a theme styles on the Desktop (decision I22): a button under the pointer is `hovered` and a button held down is `pressed`, derived from the last frame's rect and the
//! pointer, and the theme's state rules are laid over the base. Read back from the shapes the toolkit paints. Each case is also shown failing: the pointer elsewhere paints the base.
#![cfg(feature = "window")]

use egui::epaint::Shape;
use port_desktop::theme::Theme;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::json;

fn theme() -> std::sync::Arc<Theme> {
    std::sync::Arc::new(
        Theme::parse(json!({
            "version": 1, "name": "states", "defaults": {},
            "modes": {"light": {"button": {
                "base": {"background": "#eeeeee", "minSize": 40},
                "states": {"hovered": {"background": "#ff00ff"}, "pressed": {"background": "#00ff00"}}
            }}}
        }))
        .unwrap(),
    )
}

fn tree() -> Tree {
    serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "b", "component": "button", "props": {}, "events": {}, "children": [{"type": "text", "key": "t", "text": "Go"}]}})).unwrap()
}

fn fills(shapes: &[egui::epaint::ClippedShape]) -> Vec<egui::Color32> {
    fn walk(shape: &Shape, into: &mut Vec<egui::Color32>) {
        match shape {
            Shape::Vec(inner) => inner.iter().for_each(|each| walk(each, into)),
            Shape::Rect(rect) => into.push(rect.fill),
            _ => {}
        }
    }
    let mut found = Vec::new();

    shapes.iter().for_each(|clipped| walk(&clipped.shape, &mut found));

    found
}

struct Window {
    ctx: egui::Context,
    view: View,
    tree: Tree,
    time: f64,
}

impl Window {
    fn frame(&mut self, events: Vec<egui::Event>) -> Vec<egui::Color32> {
        self.time += 0.1;

        let mut out: Vec<Output> = Vec::new();
        let (view, tree) = (&mut self.view, &self.tree);
        let full = self.ctx.run(
            egui::RawInput {
                time: Some(self.time),
                screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO, egui::vec2(400.0, 300.0))),
                events,
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
            },
        );

        fills(&full.shapes)
    }
}

fn window() -> Window {
    let mut view = View::default();

    view.set_theme(Some(theme()));

    let ctx = egui::Context::default();

    ctx.set_visuals(egui::Visuals::light());

    let mut window = Window {
        ctx,
        view,
        tree: tree(),
        time: 0.0,
    };

    window.frame(vec![]);
    window.frame(vec![]);

    window
}

fn color(hex: &str) -> egui::Color32 {
    egui::Color32::from_hex(hex).unwrap()
}

#[test]
fn a_button_is_hovered_under_the_pointer_and_pressed_while_it_is_held() {
    let mut window = window();
    let at = egui::pos2(30.0, 25.0);

    let base = window.frame(vec![]);
    assert!(base.contains(&color("#eeeeee")), "the base: {base:?}");

    window.frame(vec![egui::Event::PointerMoved(at)]);

    let hovered = window.frame(vec![]);

    assert!(hovered.contains(&color("#ff00ff")), "hovered");
    assert!(!hovered.contains(&color("#eeeeee")));

    window.frame(vec![egui::Event::PointerButton {
        pos: at,
        button: egui::PointerButton::Primary,
        pressed: true,
        modifiers: egui::Modifiers::NONE,
    }]);

    let pressed = window.frame(vec![]);

    assert!(pressed.contains(&color("#00ff00")), "pressed");
    assert!(!pressed.contains(&color("#ff00ff")));

    // shown failing: the pointer away paints the base again
    window.frame(vec![egui::Event::PointerButton {
        pos: at,
        button: egui::PointerButton::Primary,
        pressed: false,
        modifiers: egui::Modifiers::NONE,
    }]);
    window.frame(vec![egui::Event::PointerMoved(egui::pos2(380.0, 280.0))]);

    let away = window.frame(vec![]);

    assert!(away.contains(&color("#eeeeee")));
    assert!(!away.contains(&color("#ff00ff")));
}
