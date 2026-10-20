//! A spec-invariant checker over the AccessKit `TreeUpdate` the PORT produces: the structure AccessKit's documentation requires of an update (which `accesskit_consumer` enforces by panicking) and the
//! role and name rules of the accessibility specification (Bet 7, decision A11): a heading has a level, and a checkbox, text field, radio group or table has a name. The check compares what the PORT
//! emits with those rules; how a platform's screen reader then presents it is that platform's concern. Pinned to AccessKit 0.17 and `accesskit_consumer` 0.26, the versions egui 0.31 uses.
#![cfg(feature = "window")]
use accesskit::{NodeId, Role, TreeUpdate};
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use std::collections::{HashMap, HashSet};

fn drawn(tree: &Tree) -> TreeUpdate {
    let ctx = egui::Context::default();
    ctx.enable_accesskit();
    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();
    ctx.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    })
    .platform_output
    .accesskit_update
    .expect("the accessibility tree")
}

/// Structural invariants stated in accesskit's TreeUpdate docs and enforced (by panic) in accesskit_consumer, returned as messages instead of panics, plus ones neither checks.
fn violations(u: &TreeUpdate) -> Vec<String> {
    let mut v = vec![];
    let by_id: HashMap<NodeId, &accesskit::Node> = u.nodes.iter().map(|(i, n)| (*i, n)).collect();
    if by_id.len() != u.nodes.len() {
        v.push("duplicate node id in update".into());
    }
    match &u.tree {
        None => v.push("initial update lacks Tree (TreeUpdate::tree must be Some)".into()),
        Some(t) => {
            if !by_id.contains_key(&t.root) {
                v.push(format!("root {:?} not in nodes", t.root));
            }
        }
    }
    if !by_id.contains_key(&u.focus) {
        v.push(format!("focus {:?} not in nodes", u.focus));
    }
    let mut parent: HashMap<NodeId, NodeId> = HashMap::new();
    for (id, n) in &u.nodes {
        let mut seen = HashSet::new();
        for c in n.children() {
            if !seen.insert(*c) {
                v.push(format!("{id:?} lists child {c:?} twice"));
            }
            if !by_id.contains_key(c) {
                v.push(format!("{id:?} child {c:?} missing"));
            }
            if let Some(p) = parent.insert(*c, *id) {
                v.push(format!("{c:?} has two parents {p:?} and {id:?}"));
            }
        }
    }
    if let Some(t) = &u.tree {
        for (id, _) in &u.nodes {
            if *id != t.root && !parent.contains_key(id) {
                v.push(format!("{id:?} is an orphan"));
            }
        }
    }
    // reachability / cycles
    if let Some(t) = &u.tree {
        let mut reach = HashSet::new();
        let mut st = vec![t.root];
        while let Some(i) = st.pop() {
            if reach.insert(i) {
                if let Some(n) = by_id.get(&i) {
                    st.extend(n.children().iter().copied());
                }
            }
        }
        for (id, _) in &u.nodes {
            if !reach.contains(id) {
                v.push(format!("{id:?} unreachable from root"));
            }
        }
    }
    // role/property rules from the ARIA-derived contract in bets/accessibility.md
    for (id, n) in &u.nodes {
        let named =
            n.label().is_some_and(|s| !s.is_empty()) || n.value().is_some_and(|s| !s.is_empty());
        match n.role() {
            Role::CheckBox | Role::TextInput | Role::RadioGroup | Role::Table
                if !named && n.labelled_by().is_empty() =>
            {
                v.push(format!("{id:?} {:?} has no accessible name", n.role()))
            }
            Role::Heading if n.level().is_none() => v.push(format!("{id:?} Heading has no level")),
            _ => {}
        }
    }
    v
}

/// A tree with every role the PORT must set itself, and every control named.
fn named() -> Tree {
    serde_json::from_value(named_json()).unwrap()
}

fn named_json() -> serde_json::Value {
    serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"h","component":"heading","props":{"level":2},"events":{},"children":[{"type":"text","key":"ht","text":"Title"}]},
      {"type":"node","key":"p","component":"paragraph","props":{},"events":{},"children":[{"type":"text","key":"pt","text":"Some text."}]},
      {"type":"node","key":"l","component":"list","props":{},"events":{},"children":[
        {"type":"node","key":"i1","component":"listitem","props":{},"events":{},"children":[{"type":"text","key":"i1t","text":"One"}]},
        {"type":"node","key":"i2","component":"listitem","props":{},"events":{},"children":[{"type":"text","key":"i2t","text":"Two"}]}]},
      {"type":"node","key":"q","component":"blockquote","props":{},"events":{},"children":[{"type":"text","key":"qt","text":"Quoted."}]},
      {"type":"node","key":"a","component":"checkbox","props":{"checked":true,"label":"Done"},"events":{},"children":[]},
      {"type":"node","key":"b","component":"textfield","props":{"value":"","label":"New item"},"events":{},"children":[]}]}})
}

/// A tree with a checkbox that has no name (a template error the compiler will report as `unnamed-control`).
fn unnamed() -> Tree {
    serde_json::from_value(serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"x","component":"checkbox","props":{"checked":false},"events":{},"children":[]}]}})).unwrap()
}

fn roles(u: &TreeUpdate, role: Role) -> Vec<&accesskit::Node> {
    u.nodes
        .iter()
        .map(|(_, n)| n)
        .filter(|n| n.role() == role)
        .collect()
}

#[test]
fn the_update_passes_the_invariants_and_the_consumer() {
    let u = drawn(&named());
    let v = violations(&u);
    assert!(v.is_empty(), "{v:#?}");
    // the consumer panics on structural errors; building a tree from the real update proves it passes
    let t = accesskit_consumer::Tree::new(u.clone(), true);
    let _ = t.state().root().id();
}

/// Decision A11: egui never emits these roles, so the PORT sets them.
#[test]
fn heading_has_a_level_and_paragraph_list_and_list_items_have_their_roles() {
    let u = drawn(&named());
    let headings = roles(&u, Role::Heading);
    assert_eq!(headings.len(), 1, "one Heading");
    assert_eq!(headings[0].level(), Some(2));
    // its text, drawn inside it, is its name
    assert!(!headings[0].children().is_empty());
    assert_eq!(roles(&u, Role::Paragraph).len(), 1, "one Paragraph");
    assert_eq!(roles(&u, Role::List).len(), 1, "one List");
    let items = roles(&u, Role::ListItem);
    assert_eq!(items.len(), 2, "two ListItems");
    let mut positions: Vec<_> = items.iter().map(|item| item.position_in_set()).collect();
    positions.sort();
    assert_eq!(positions, [Some(1), Some(2)]);
    assert!(items.iter().all(|item| item.size_of_set() == Some(2)));
    // and the list's items are its children, and an item's text is the item's
    let list = roles(&u, Role::List)[0];
    assert_eq!(list.children().len(), 2);
    for item in &items {
        assert!(!item.children().is_empty());
    }
}

#[test]
fn a_heading_without_a_level_would_be_caught() {
    let mut u = drawn(&named());
    for (_, n) in u.nodes.iter_mut() {
        if n.role() == Role::Heading {
            n.clear_level();
        }
    }
    assert!(violations(&u)
        .iter()
        .any(|m| m.contains("Heading has no level")));
}

#[test]
fn an_unnamed_control_is_reported() {
    let v = violations(&drawn(&unnamed()));
    assert!(
        v.iter().any(|m| m.contains("has no accessible name")),
        "{v:?}"
    );
}

#[test]
fn corrupted_updates_are_caught() {
    let mut u = drawn(&named());
    // dangle a child id
    let (_, root) = u.nodes.first_mut().unwrap();
    root.push_child(NodeId(999_999));
    let v = violations(&u);
    assert!(v.iter().any(|m| m.contains("missing")));
    assert!(std::panic::catch_unwind(|| accesskit_consumer::Tree::new(u.clone(), true)).is_err());
    let mut u2 = drawn(&named());
    u2.focus = NodeId(424242);
    assert!(violations(&u2).iter().any(|m| m.contains("focus")));
    assert!(std::panic::catch_unwind(|| accesskit_consumer::Tree::new(u2.clone(), true)).is_err());
}

/// Decision A11 (the version-1 role set has 23 names, `blockquote` among them): egui never emits the role, so the PORT sets it.
#[test]
fn blockquote_has_its_role_and_its_text_is_its_content() {
    let u = drawn(&named());
    let quotes = roles(&u, Role::Blockquote);
    assert_eq!(quotes.len(), 1, "one Blockquote");
    assert!(
        !quotes[0].children().is_empty(),
        "its text, drawn inside it, is its content"
    );
    assert!(violations(&u).is_empty());
}

/// The bullet or number of a list item is decoration, not content: it is hidden from assistive technology, and
/// the item's own text is not.
#[test]
fn a_list_markers_are_hidden_and_the_items_text_is_not() {
    for ordered in [false, true] {
        let mut tree = serde_json::to_value(named_json()).unwrap();
        tree["root"]["children"][2]["props"] = serde_json::json!({ "ordered": ordered });
        let tree: Tree = serde_json::from_value(tree).unwrap();
        let u = drawn(&tree);
        let items = roles(&u, Role::ListItem);
        assert_eq!(items.len(), 2);

        let by_id: HashMap<NodeId, &accesskit::Node> =
            u.nodes.iter().map(|(i, n)| (*i, n)).collect();
        let mut markers = 0;
        let mut texts = vec![];
        for item in &items {
            for child in item.children() {
                let node = by_id[child];
                let text = node.value().or(node.label()).unwrap_or("").to_owned();
                if text.trim() == "\u{2022}" || text.trim_end_matches(". ").parse::<u32>().is_ok() {
                    assert!(
                        node.is_hidden(),
                        "the marker {text:?} is exposed as content"
                    );
                    markers += 1;
                } else {
                    assert!(
                        !node.is_hidden(),
                        "the item's text {text:?} must be exposed"
                    );
                    texts.push(text);
                }
            }
        }
        assert_eq!(markers, 2, "one marker per item (ordered: {ordered})");
        texts.sort();
        assert_eq!(texts, ["One", "Two"]);
    }
}

/// A tree with the two live-region primitives (decision A13): `status` is polite, `alert` is assertive, both atomic, and the text drawn inside is the message.
fn live() -> Tree {
    serde_json::from_value(serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"s","component":"status","props":{},"events":{},"children":[{"type":"text","key":"st","text":"Saved."}]},
      {"type":"node","key":"a","component":"alert","props":{},"events":{},"children":[{"type":"text","key":"at","text":"Could not save."}]}]}})).unwrap()
}

/// Decision A13: egui never emits Status or Alert, so the PORT sets the role and the live setting the ARIA specification implies (`role=status`: polite, atomic; `role=alert`: assertive, atomic).
#[test]
fn status_and_alert_have_their_roles_and_their_live_settings() {
    let u = drawn(&live());
    let status = roles(&u, Role::Status);
    let alert = roles(&u, Role::Alert);
    assert_eq!((status.len(), alert.len()), (1, 1));
    assert_eq!(status[0].live(), Some(accesskit::Live::Polite));
    assert_eq!(alert[0].live(), Some(accesskit::Live::Assertive));
    assert!(status[0].is_live_atomic() && alert[0].is_live_atomic());
    // the text drawn inside is the message, and neither region has a name of its own (ARIA: author-only naming, not required)
    assert!(!status[0].children().is_empty() && !alert[0].children().is_empty());
    let v = violations(&u);
    assert!(v.is_empty(), "{v:#?}");
    let t = accesskit_consumer::Tree::new(u.clone(), true);
    let _ = t.state().root().id();
}

/// The region exists before its text changes (the APG alert pattern): an empty `status` is still a Status node.
#[test]
fn an_empty_status_is_still_a_live_region() {
    let tree: Tree = serde_json::from_value(serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"s","component":"status","props":{},"events":{},"children":[]}]}})).unwrap();
    let u = drawn(&tree);
    let status = roles(&u, Role::Status);

    assert_eq!(status.len(), 1);
    assert_eq!(status[0].live(), Some(accesskit::Live::Polite));
}

/// The `toggle` primitive: a button that stays pressed. Its role is Button, and its pressed state is the accessibility tree's toggled state (the ARIA `aria-pressed`); its name is its label, else its text.
#[test]
fn toggle_is_a_button_with_a_pressed_state_and_a_name() {
    let tree: Tree = serde_json::from_value(serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"on","component":"toggle","props":{"pressed":true,"label":"Bold"},"events":{"change":"h1"},"children":[{"type":"text","key":"t1","text":"B"}]},
      {"type":"node","key":"off","component":"toggle","props":{"pressed":false},"events":{"change":"h2"},"children":[{"type":"text","key":"t2","text":"Italic"}]}]}})).unwrap();
    let u = drawn(&tree);
    let buttons = roles(&u, Role::Button);

    assert_eq!(buttons.len(), 2);
    // (found by name: the order of the tree's nodes is the toolkit's ids', which a layout change may reorder)
    let bold = buttons
        .iter()
        .find(|node| node.label() == Some("Bold"))
        .expect("a label wins");
    let italic = buttons
        .iter()
        .find(|node| node.label().is_some_and(|name| name.contains("Italic")))
        .expect("otherwise the text drawn inside names it");

    assert_eq!(bold.toggled(), Some(accesskit::Toggled::True));
    assert_eq!(italic.toggled(), Some(accesskit::Toggled::False));
    let v = violations(&u);
    assert!(v.is_empty(), "{v:#?}");
}
