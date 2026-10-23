//! The Desktop's focus keys, read the way a platform's accessibility adapter reads them: every frame's `TreeUpdate` goes into AccessKit's own consumer (`accesskit_consumer`, 0.26, the one the
//! platform adapters are built on), and what is asserted is what the consumer says: which node has focus, that it can take focus, what is its name and its ancestors, which radio is checked, that a
//! dialog is modal. The keys are the Authoring Practices' (the radio group and the modal dialog), as the reference for the keys only.
#![cfg(feature = "window")]

use accesskit::{Role, Toggled};
use accesskit_consumer::Tree as Consumer;
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use serde_json::{json, Value};

fn button(key: &str) -> Value {
    json!({"type": "node", "key": key, "component": "button", "props": {"label": key}, "events": {"click": format!("click-{key}")}, "children": []})
}

fn radio(key: &str, checked: bool) -> Value {
    json!({"type": "node", "key": key, "component": "radio", "props": {"label": key, "value": key, "checked": checked}, "events": {"select": format!("select-{key}")}, "children": []})
}

fn tree(children: Vec<Value>) -> Tree {
    serde_json::from_value(json!({"format": "mesh-render", "version": 1, "root": {"type": "node", "key": "page", "component": "column", "props": {}, "events": {}, "children": children}})).unwrap()
}

fn group(checked: &str) -> Tree {
    let radios: Vec<Value> = ["s", "m", "l"]
        .iter()
        .map(|key| radio(key, *key == checked))
        .collect();

    tree(vec![
        button("before"),
        json!({"type": "node", "key": "size", "component": "radiogroup", "props": {"label": "Size"}, "events": {}, "children": radios}),
        button("after"),
    ])
}

fn dialog(open: bool) -> Tree {
    tree(vec![
        button("opener"),
        json!({"type": "node", "key": "dialog", "component": "dialog", "props": {"open": open, "label": "Dialog"}, "events": {"dismiss": "dismiss"}, "children": [button("d1"), button("d2"), button("d3")]}),
    ])
}

struct Reader {
    ctx: egui::Context,
    view: View,
    consumer: Option<Consumer>,
}

impl Reader {
    fn new() -> Reader {
        let ctx = egui::Context::default();
        ctx.enable_accesskit();

        Reader {
            ctx,
            view: View::default(),
            consumer: None,
        }
    }

    fn frame(&mut self, tree: &Tree, events: Vec<egui::Event>, modifiers: egui::Modifiers) {
        let mut out: Vec<Output> = Vec::new();
        let view = &mut self.view;
        let update = self
            .ctx
            .run(
                egui::RawInput {
                    events,
                    modifiers,
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

        match &mut self.consumer {
            Some(consumer) => consumer.update(update),
            None => self.consumer = Some(Consumer::new(update, true)),
        }
    }

    fn settle(&mut self, tree: &Tree) {
        for _ in 0..4 {
            self.frame(tree, vec![], egui::Modifiers::NONE);
        }
    }

    fn press(&mut self, tree: &Tree, key: egui::Key, shift: bool) {
        let modifiers = egui::Modifiers {
            shift,
            ..Default::default()
        };
        let event = |pressed| egui::Event::Key {
            key,
            physical_key: Some(key),
            pressed,
            repeat: false,
            modifiers,
        };

        self.frame(tree, vec![event(true)], modifiers);
        self.frame(tree, vec![event(false)], egui::Modifiers::NONE);
        self.settle(tree);
    }

    /// The name of the node the consumer says has focus, and whether the consumer says it is focused and can take focus (it supports the focus action).
    fn focus(&self) -> (String, bool) {
        let state = self.consumer.as_ref().unwrap().state();
        let node = state.focus().expect("a node has focus");

        (
            node.label().unwrap_or_default(),
            node.is_focused() && node.is_focusable(),
        )
    }

    /// Every node the consumer has, from the root.
    fn all(&self) -> Vec<accesskit_consumer::Node<'_>> {
        fn walk<'a>(
            node: accesskit_consumer::Node<'a>,
            into: &mut Vec<accesskit_consumer::Node<'a>>,
        ) {
            into.push(node);

            for child in node.children() {
                walk(child, into);
            }
        }

        let mut found = Vec::new();

        walk(self.consumer.as_ref().unwrap().state().root(), &mut found);

        found
    }

    fn named(&self, role: Role) -> Vec<String> {
        self.all()
            .into_iter()
            .filter(|node| node.role() == role)
            .filter_map(|node| node.label())
            .collect()
    }
}

#[test]
fn the_consumer_sees_focus_move_through_a_radio_group_as_the_pattern_says() {
    let mut reader = Reader::new();
    let tree = group("m");

    reader.settle(&tree);
    reader.view.focus("before");
    reader.settle(&tree);
    assert_eq!(reader.focus(), ("before".into(), true));

    // one tab stop, at the checked radio
    reader.press(&tree, egui::Key::Tab, false);
    assert_eq!(reader.focus(), ("m".into(), true));
    reader.press(&tree, egui::Key::Tab, false);
    assert_eq!(reader.focus().0, "after");
    reader.press(&tree, egui::Key::Tab, true);
    assert_eq!(reader.focus().0, "m");

    // the arrows move focus, and the consumer reads a radio's name, role and place in its group
    reader.press(&tree, egui::Key::ArrowDown, false);

    let focused = reader.consumer.as_ref().unwrap().state().focus().unwrap();

    assert_eq!(focused.label().as_deref(), Some("l"));
    assert_eq!(focused.role(), Role::RadioButton);
    assert_eq!(
        focused.parent().map(|parent| parent.role()),
        Some(Role::RadioGroup)
    );
    assert_eq!(
        focused
            .parent()
            .and_then(|parent| parent.label())
            .as_deref(),
        Some("Size")
    );
    assert_eq!(
        reader
            .all()
            .iter()
            .filter(|node| node.role() == Role::RadioButton && node.toggled() == Some(Toggled::True))
            .count(),
        1,
        "one radio is checked"
    );
}

#[test]
fn the_consumer_sees_focus_stay_inside_a_modal_dialog_and_come_back() {
    let mut reader = Reader::new();
    let (closed, open) = (dialog(false), dialog(true));

    reader.settle(&closed);
    reader.view.focus("opener");
    reader.settle(&closed);
    assert_eq!(
        reader.named(Role::Dialog),
        Vec::<String>::new(),
        "no dialog node while it is closed"
    );

    reader.settle(&open);

    let inside = |reader: &Reader| {
        let state = reader.consumer.as_ref().unwrap().state();
        let focus = state.focus().unwrap();

        (
            focus.label().unwrap_or_default(),
            std::iter::successors(Some(focus), |node| node.parent())
                .any(|node| node.role() == Role::Dialog),
        )
    };

    assert_eq!(
        inside(&reader),
        ("d1".into(), true),
        "focus moves into the modal dialog"
    );

    for _ in 0..7 {
        reader.press(&open, egui::Key::Tab, false);
        assert!(inside(&reader).1, "Tab does not leave the dialog");
    }

    for _ in 0..7 {
        reader.press(&open, egui::Key::Tab, true);
        assert!(inside(&reader).1, "Shift+Tab does not leave the dialog");
    }

    assert_eq!(reader.named(Role::Dialog), ["Dialog"]);

    // closed by the application: the consumer has no dialog and focus is back on the invoker
    reader.settle(&closed);
    assert_eq!(reader.named(Role::Dialog), Vec::<String>::new());
    assert_eq!(reader.focus(), ("opener".into(), true));
}

#[test]
fn the_consumer_sees_a_popover_as_a_named_group_while_it_is_open() {
    let mut reader = Reader::new();
    let popover = |open: bool| {
        tree(vec![
            serde_json::from_value(json!({"type": "node", "key": "anchor", "component": "button", "props": {"label": "Menu", "id": "menu"}, "events": {}, "children": []})).unwrap(),
            json!({"type": "node", "key": "tip", "component": "popover", "props": {"open": open, "anchor": "menu", "label": "Details"}, "events": {"dismiss": "dismiss"}, "children": [button("inside")]}),
        ])
    };

    reader.settle(&popover(false));
    assert_eq!(reader.named(Role::Group), Vec::<String>::new());
    reader.settle(&popover(true));
    assert_eq!(reader.named(Role::Group), ["Details"]);
    reader.settle(&popover(false));
    assert_eq!(reader.named(Role::Group), Vec::<String>::new());
}
