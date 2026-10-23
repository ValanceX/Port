//! The Desktop PORT's popover (decisions I4, I10): a layer above the content, anchored to the part whose `id` it names, not modal. `auto` is light-dismissed (a click outside it, Escape: a `dismiss`
//! with the reason); `manual` only the application closes. It stays open until the application says otherwise, and closing returns focus to the invoker when focus was inside.
#![cfg(feature = "window")]

use port_desktop::port::Report;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};

fn button(key: &str, id: Option<&str>) -> Value {
    let mut props = json!({"label": key});

    if let Some(id) = id {
        props["id"] = json!(id);
    }

    json!({"type": "node", "key": key, "component": "button", "props": props, "events": {"click": format!("click-{key}")}, "children": []})
}

fn screen(open: bool, kind: &str, placement: &str) -> Tree {
    // some lines above the invoker, so that there is room above it
    let above: Vec<Value> = (0..8).map(|n| json!({"type": "node", "key": format!("line{n}"), "component": "text", "props": {}, "events": {}, "children": [{"type": "text", "key": format!("t{n}"), "text": "a line"}]})).collect();
    let mut children = above;

    children.extend([
        button("invoker", Some("invoker")),
        button("elsewhere", None),
        json!({"type": "node", "key": "pop", "component": "popover", "props": {"open": open, "anchor": "invoker", "placement": placement, "kind": kind}, "events": {"dismiss": "dismiss"}, "children": [button("inside", None)]}),
    ]);

    serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "page", "component": "column", "props": {}, "events": {}, "children": children}})).unwrap()
}

struct Window {
    ctx: egui::Context,
    view: View,
    last: Option<egui::accesskit::TreeUpdate>,
}

impl Window {
    fn new() -> Window {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();

        Window {
            ctx,
            view: View::default(),
            last: None,
        }
    }

    fn frame(&mut self, tree: &Tree, events: Vec<egui::Event>) -> Vec<String> {
        let mut out: Vec<Output> = Vec::new();
        let view = &mut self.view;
        let update = self
            .ctx
            .run(
                egui::RawInput {
                    events,
                    ..Default::default()
                },
                |ctx| {
                    egui::CentralPanel::default()
                        .show(ctx, |ui| view.show(ui, &tree.root, &mut out));
                },
            )
            .platform_output
            .accesskit_update
            .expect("the accessibility tree");

        self.last = Some(update);

        out.into_iter()
            .filter_map(|output| match output {
                Output::Report(Report { handler, payload }) if handler == "dismiss" => {
                    payload.and_then(|value| value.as_str().map(str::to_owned))
                }
                _ => None,
            })
            .collect()
    }

    fn settle(&mut self, tree: &Tree) -> Vec<String> {
        (0..4).flat_map(|_| self.frame(tree, vec![])).collect()
    }

    fn bounds(&self, label: &str) -> Option<egui::accesskit::Rect> {
        self.last
            .as_ref()
            .unwrap()
            .nodes
            .iter()
            .find(|(_, node)| {
                node.label() == Some(label) && node.role() == egui::accesskit::Role::Button
            })
            .and_then(|(_, node)| node.bounds())
    }

    fn focused(&self) -> String {
        let update = self.last.as_ref().unwrap();

        update
            .nodes
            .iter()
            .find(|(id, _)| *id == update.focus)
            .and_then(|(_, node)| node.label().map(str::to_owned))
            .unwrap_or_else(|| "nothing".into())
    }

    fn click(&mut self, tree: &Tree, label: &str) -> Vec<String> {
        let at = self
            .bounds(label)
            .map(|bounds| {
                egui::pos2(
                    ((bounds.x0 + bounds.x1) / 2.0) as f32,
                    ((bounds.y0 + bounds.y1) / 2.0) as f32,
                )
            })
            .expect("a button to click");
        let button = |pressed| egui::Event::PointerButton {
            pos: at,
            button: egui::PointerButton::Primary,
            pressed,
            modifiers: egui::Modifiers::NONE,
        };
        let mut reported = self.frame(tree, vec![egui::Event::PointerMoved(at)]);

        reported.extend(self.frame(tree, vec![button(true)]));
        reported.extend(self.frame(tree, vec![button(false)]));
        reported
    }

    fn escape(&mut self, tree: &Tree) -> Vec<String> {
        let key = |pressed| egui::Event::Key {
            key: egui::Key::Escape,
            physical_key: Some(egui::Key::Escape),
            pressed,
            repeat: false,
            modifiers: egui::Modifiers::NONE,
        };
        let reported = self.frame(tree, vec![key(true)]);

        self.frame(tree, vec![key(false)]);
        reported
    }
}

#[test]
fn it_is_drawn_only_while_the_application_has_it_open_and_sits_below_its_anchor_by_the_placement() {
    let mut window = Window::new();

    window.settle(&screen(false, "auto", "bottom"));
    assert!(window.bounds("inside").is_none(), "closed: not drawn");

    window.settle(&screen(true, "auto", "bottom"));

    let (anchor, inside) = (
        window.bounds("invoker").unwrap(),
        window.bounds("inside").unwrap(),
    );

    assert!(inside.y0 >= anchor.y1 - 1.0, "below the anchor");
    assert!(
        ((inside.x0 + inside.x1) / 2.0 - (anchor.x0 + anchor.x1) / 2.0).abs() < 40.0,
        "against the anchor's middle"
    );

    window.settle(&screen(true, "auto", "top"));
    assert!(
        window.bounds("inside").unwrap().y1 <= window.bounds("invoker").unwrap().y0 + 1.0,
        "above it"
    );
}

#[test]
fn auto_is_dismissed_by_a_click_outside_and_by_escape_and_manual_by_neither() {
    let mut window = Window::new();
    let open = screen(true, "auto", "end");

    window.settle(&open);
    assert_eq!(window.click(&open, "elsewhere"), ["outside"]);
    assert_eq!(window.escape(&open), ["escape"]);
    assert!(
        window.click(&open, "inside").is_empty(),
        "a click inside is not a dismissal"
    );

    let manual = screen(true, "manual", "end");
    let mut window = Window::new();

    window.settle(&manual);
    assert!(window.click(&manual, "elsewhere").is_empty());
    assert!(window.escape(&manual).is_empty());
}

#[test]
fn closing_it_returns_focus_to_the_invoker_when_focus_was_inside() {
    let mut window = Window::new();
    let open = screen(true, "manual", "bottom");

    window.view.focus("invoker");
    window.settle(&screen(false, "manual", "bottom"));
    window.settle(&open);
    window.view.focus("inside");
    window.settle(&open);
    assert_eq!(window.focused(), "inside");

    window.settle(&screen(false, "manual", "bottom"));
    assert_eq!(window.focused(), "invoker");
}
