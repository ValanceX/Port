//! Focus follows identity on the Desktop (decisions I2 and I13). egui keeps focus by widget id, and the ids come from node keys (I16), so a node that moves keeps its focus by itself. What
//! is left is the node that is gone, which hands focus to what follows it, then what precedes it, then what holds it; and the host's request to focus a node by key.
use crate::tree::Node;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

/// The components that take keyboard focus.
const FOCUSABLE: [&str; 5] = ["button", "toggle", "checkbox", "textfield", "radio"];

/// The shape of a frame's tree, as far as focus needs it.
#[derive(Debug, Default, Clone)]
pub struct Outline {
    root: Option<String>,
    parents: HashMap<String, String>,
    children: HashMap<String, Vec<String>>,
    /// The nodes that take focus: a focusable component that is not disabled.
    takes: HashSet<String>,
}

impl Outline {
    pub fn of(root: &Node) -> Outline {
        fn walk(node: &Node, parent: Option<&str>, into: &mut Outline) {
            let Node::Node {
                key,
                component,
                props,
                children,
                ..
            } = node
            else {
                return;
            };

            if let Some(parent) = parent {
                into.parents.insert(key.clone(), parent.to_owned());
            }

            into.children.insert(
                key.clone(),
                children
                    .iter()
                    .map(|child| child.key().to_owned())
                    .collect(),
            );

            if FOCUSABLE.contains(&component.as_str())
                && props.get("disabled").and_then(Value::as_bool) != Some(true)
            {
                into.takes.insert(key.clone());
            }

            for child in children {
                walk(child, Some(key), into);
            }
        }

        let mut outline = Outline {
            root: Some(root.key().to_owned()),
            ..Outline::default()
        };

        walk(root, None, &mut outline);

        outline
    }

    pub fn contains(&self, key: &str) -> bool {
        self.children.contains_key(key)
    }

    /// The nodes that take focus, in order, that `reachable` lets through.
    pub fn in_order(&self, reachable: &dyn Fn(&str) -> bool) -> Vec<String> {
        fn walk(
            outline: &Outline,
            key: &str,
            reachable: &dyn Fn(&str) -> bool,
            into: &mut Vec<String>,
        ) {
            if outline.takes.contains(key) && reachable(key) {
                into.push(key.to_owned());
            }

            for child in outline.children.get(key).into_iter().flatten() {
                walk(outline, child, reachable, into);
            }
        }

        let mut found = Vec::new();

        if let Some(root) = &self.root {
            walk(self, root, reachable, &mut found);
        }

        found
    }

    /// Whether the node, or anything under it, takes focus.
    pub fn holds_focus(&self, key: &str) -> bool {
        self.takes.contains(key)
            || self
                .children
                .get(key)
                .is_some_and(|children| children.iter().any(|child| self.holds_focus(child)))
    }

    /// Where focus goes when `gone` is no longer in the tree (`self` is the tree it was in, `now` the tree that has no `gone`): the following siblings in order, the preceding ones nearest first,
    /// then the nodes that held it from the nearest outwards; the first that `now` still has and that takes focus or holds something that does.
    pub fn heir(&self, gone: &str, now: &Outline) -> Option<String> {
        let mut candidates: Vec<&str> = Vec::new();
        let mut at = gone;

        while let Some(parent) = self.parents.get(at) {
            let siblings = &self.children[parent];
            let place = siblings.iter().position(|each| each == at).unwrap_or(0);

            if at == gone {
                candidates.extend(siblings[place + 1..].iter().map(String::as_str));
                candidates.extend(siblings[..place].iter().rev().map(String::as_str));
            }

            candidates.push(parent);
            at = parent;
        }

        candidates
            .into_iter()
            .find(|key| now.contains(key) && now.holds_focus(key))
            .map(str::to_owned)
    }
}

/// What the window asks of the next frame about focus.
#[derive(Debug, Default)]
pub struct Asking {
    /// The key whose widget, or the first widget under it that takes focus, gets focus.
    pending: Option<String>,
    /// A container named by `pending` is being drawn: the first widget in it that takes focus gets it.
    seeking: bool,
}

impl Asking {
    pub fn ask(&mut self, key: &str) {
        self.pending = Some(key.to_owned());
        self.seeking = false;
    }

    /// A node is about to be drawn. Returns whether it is a container the request names (and the caller must `leave` it when done).
    pub fn enter(&mut self, key: &str, takes_focus: bool) -> bool {
        if !takes_focus && self.pending.as_deref() == Some(key) {
            self.pending = None;
            self.seeking = true;

            return true;
        }

        false
    }

    /// The next widget drawn that takes focus gets it: the person pressed Tab in a part that handles Tab itself, and focus goes on past it.
    pub fn seek_next(&mut self) {
        self.pending = None;
        self.seeking = true;
    }

    pub fn leave(&mut self) {
        self.seeking = false;
    }

    /// A widget that takes focus is drawn for `key`: whether it is the one the request means.
    pub fn is_for(&mut self, key: &str) -> bool {
        if self.seeking || self.pending.as_deref() == Some(key) {
            self.pending = None;
            self.seeking = false;

            return true;
        }

        false
    }

    /// The frame is over: a request for a node that was not drawn is dropped, not kept for a node that may come later. Returns whether a search for the next widget found none.
    pub fn end_frame(&mut self) -> bool {
        let unmet = self.seeking;

        self.pending = None;
        self.seeking = false;

        unmet
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tree(spec: serde_json::Value) -> Outline {
        Outline::of(&serde_json::from_value(spec).unwrap())
    }

    fn node(key: &str, component: &str, children: Vec<serde_json::Value>) -> serde_json::Value {
        json!({"type": "node", "key": key, "component": component, "props": {}, "events": {}, "children": children})
    }

    #[test]
    fn focus_goes_to_what_follows_then_what_precedes_then_what_holds() {
        let before = tree(node(
            "root",
            "column",
            vec![
                node("a", "button", vec![]),
                node("b", "button", vec![]),
                node("c", "button", vec![]),
            ],
        ));

        // the middle one is gone: the one after it
        let without_b = tree(node(
            "root",
            "column",
            vec![node("a", "button", vec![]), node("c", "button", vec![])],
        ));
        assert_eq!(before.heir("b", &without_b).as_deref(), Some("c"));

        // the last one is gone: the one before it
        let without_c = tree(node(
            "root",
            "column",
            vec![node("a", "button", vec![]), node("b", "button", vec![])],
        ));
        assert_eq!(before.heir("c", &without_c).as_deref(), Some("b"));

        // nothing left beside it: what held it, if that holds something that takes focus
        let nested = tree(node(
            "root",
            "column",
            vec![
                node("x", "button", vec![]),
                node("group", "column", vec![node("a", "button", vec![])]),
            ],
        ));
        let emptied = tree(node(
            "root",
            "column",
            vec![node("x", "button", vec![]), node("group", "column", vec![])],
        ));
        assert_eq!(
            nested.heir("a", &emptied).as_deref(),
            Some("root"),
            "the group holds nothing now; the root holds the other button"
        );
    }

    #[test]
    fn a_disabled_node_does_not_take_focus() {
        let mut disabled = node("b", "button", vec![]);
        disabled["props"] = json!({"disabled": true});
        let before = tree(node(
            "root",
            "column",
            vec![
                node("a", "button", vec![]),
                node("gone", "button", vec![]),
                disabled.clone(),
            ],
        ));
        let now = tree(node(
            "root",
            "column",
            vec![node("a", "button", vec![]), disabled],
        ));

        assert_eq!(before.heir("gone", &now).as_deref(), Some("a"));
    }

    #[test]
    fn a_request_is_for_the_node_or_the_first_thing_that_takes_focus_in_it() {
        let mut asking = Asking::default();

        asking.ask("form");
        assert!(!asking.enter("other", false));
        assert!(asking.enter("form", false));
        assert!(asking.is_for("first"));
        assert!(!asking.is_for("second"));
        asking.leave();

        asking.ask("field");
        assert!(
            !asking.enter("field", true),
            "a widget is asked by its own key"
        );
        assert!(asking.is_for("field"));

        asking.ask("gone");
        assert!(!asking.end_frame());
        assert!(
            !asking.is_for("gone"),
            "a request for a node that was not drawn is dropped"
        );
    }
}

#[cfg(test)]
mod order {
    use super::*;
    use serde_json::json;

    #[test]
    fn the_nodes_that_take_focus_are_listed_in_order() {
        let button = |key: &str| json!({"type": "node", "key": key, "component": "button", "props": {}, "events": {}, "children": []});
        let outline = Outline::of(&serde_json::from_value(json!({"type": "node", "key": "root", "component": "column", "props": {}, "events": {},
            "children": [button("a"), {"type": "node", "key": "g", "component": "column", "props": {}, "events": {}, "children": [button("b"), button("c")]}]})).unwrap());

        assert_eq!(outline.in_order(&|_| true), ["a", "b", "c"]);
        assert_eq!(outline.in_order(&|key| key != "b"), ["a", "c"]);
    }
}
