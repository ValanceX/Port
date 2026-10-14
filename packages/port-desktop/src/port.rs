//! The Desktop PORT's operations (the PORT contract, version 1): `draw`, `update`, `unmount`, and the reports an interaction produces. The window (`view.rs`) realizes what is drawn; nothing here
//! needs one, so the contract can be tested, and a different front end can use it, without a display.
use crate::tree::{Node, Tree, FORMAT, VERSION};
use serde_json::Value;

/// What the person did, resolved to the handler identifier the tree carries and the event's payload. The PORT never interprets either: the composer dispatches them.
#[derive(Debug, Clone, PartialEq)]
pub struct Report {
    pub handler: String,
    pub payload: Option<Value>,
}

/// Why an operation was refused. Each has a stable `code`.
#[derive(Debug, Clone, PartialEq)]
pub enum PortError {
    /// The tree is not `mesh-render` version 1.
    UnsupportedFormat { format: String, version: u64 },
    /// `update` before anything was drawn (or after `unmount`).
    NotDrawn,
}

impl PortError {
    pub fn code(&self) -> &'static str {
        match self {
            PortError::UnsupportedFormat { .. } => "unsupported-format",
            PortError::NotDrawn => "not-drawn",
        }
    }
}

impl std::fmt::Display for PortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PortError::UnsupportedFormat { format, version } => write!(f, "unsupported-format: this PORT reads {FORMAT} version {VERSION}, not {format} version {version}"),
            PortError::NotDrawn => write!(f, "not-drawn: nothing is drawn; draw a tree first"),
        }
    }
}

impl std::error::Error for PortError {}

/// The Desktop PORT. One per window.
#[derive(Debug, Default)]
pub struct Port {
    tree: Option<Tree>,
    draws: usize,
    updates: usize,
}

impl Port {
    pub fn new() -> Port {
        Port::default()
    }

    /// Realize `tree` afresh. For the first tree, and for any tree the composer knows comes from a different program.
    pub fn draw(&mut self, tree: Tree) -> Result<(), PortError> {
        check(&tree)?;
        self.tree = Some(tree);
        self.draws += 1;
        Ok(())
    }

    /// The composer asserts `tree` comes from the same program as the drawn one: realize its changes in place. Parts are matched by `key` and nothing else (a field keeps what is being typed into it).
    pub fn update(&mut self, tree: Tree) -> Result<(), PortError> {
        check(&tree)?;
        if self.tree.is_none() {
            return Err(PortError::NotDrawn);
        }
        self.tree = Some(tree);
        self.updates += 1;
        Ok(())
    }

    /// Remove the realization. Safe to call twice and before anything was drawn; the PORT stays usable.
    pub fn unmount(&mut self) {
        self.tree = None;
    }

    pub fn tree(&self) -> Option<&Tree> {
        self.tree.as_ref()
    }

    /// How many trees were drawn afresh and how many updated in place. For tests and tools: not part of the contract.
    pub fn counts(&self) -> (usize, usize) {
        (self.draws, self.updates)
    }
}

fn check(tree: &Tree) -> Result<(), PortError> {
    if tree.format == FORMAT && tree.version == VERSION {
        Ok(())
    } else {
        Err(PortError::UnsupportedFormat {
            format: tree.format.clone(),
            version: tree.version,
        })
    }
}

/// Reading what is drawn, as a person would: for tests and tools, not part of the contract.
pub mod inspect {
    use super::*;

    fn all(port: &Port) -> Vec<&Node> {
        fn walk<'a>(node: &'a Node, into: &mut Vec<&'a Node>) {
            into.push(node);
            if let Node::Node { children, .. } = node {
                for child in children {
                    walk(child, into);
                }
            }
        }
        let mut found = Vec::new();
        if let Some(tree) = port.tree() {
            walk(&tree.root, &mut found);
        }
        found
    }

    /// The report for clicking the nth enabled button whose label starts with `label`.
    pub fn click(port: &Port, label: &str, nth: usize) -> Option<Report> {
        all(port)
            .into_iter()
            .filter_map(|node| match node {
                Node::Node {
                    component,
                    props,
                    events,
                    ..
                } if component == "button" && node.text().starts_with(label) => Some((
                    props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    events.get("click"),
                )),
                _ => None,
            })
            .nth(nth)
            .and_then(|(disabled, handler)| if disabled { None } else { handler.cloned() })
            .map(|handler| Report {
                handler,
                payload: None,
            })
    }

    /// The report for ticking or unticking the checkbox in the row of the button labelled `label`: its new value.
    pub fn check(port: &Port, label: &str) -> Option<Report> {
        fn rows<'a>(node: &'a Node, into: &mut Vec<&'a Node>) {
            if let Node::Node {
                component,
                children,
                ..
            } = node
            {
                if component == "row" {
                    into.push(node);
                }
                children.iter().for_each(|child| rows(child, into));
            }
        }
        let mut found = Vec::new();

        if let Some(tree) = port.tree() {
            rows(&tree.root, &mut found);
        }

        found.into_iter().find_map(|row| {
            let Node::Node { children, .. } = row else {
                return None;
            };

            children
                .iter()
                .any(|child| {
                    matches!(child, Node::Node { component, .. } if component == "button")
                        && child.text().starts_with(label)
                })
                .then_some(())?;
            children.iter().find_map(|child| match child {
                Node::Node {
                    component,
                    props,
                    events,
                    ..
                } if component == "checkbox" => {
                    let now = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    events.get("change").map(|handler| Report {
                        handler: handler.clone(),
                        payload: Some(Value::Bool(!now)),
                    })
                }
                _ => None,
            })
        })
    }

    /// The report for typing `text` into the textfield with this placeholder.
    pub fn type_into(port: &Port, placeholder: &str, text: &str) -> Option<Report> {
        all(port).into_iter().find_map(|node| match node {
            Node::Node {
                component,
                props,
                events,
                ..
            } if component == "textfield"
                && props.get("placeholder").and_then(Value::as_str) == Some(placeholder) =>
            {
                events.get("change").map(|handler| Report {
                    handler: handler.clone(),
                    payload: Some(Value::String(text.to_owned())),
                })
            }
            _ => None,
        })
    }

    /// The labels of every button, in order.
    pub fn buttons(port: &Port) -> Vec<String> {
        all(port)
            .into_iter()
            .filter(|node| matches!(node, Node::Node { component, .. } if component == "button"))
            .map(Node::text)
            .collect()
    }

    /// Every piece of text and textfield value on the screen, in order: what a person could read.
    pub fn readable(port: &Port) -> Vec<String> {
        all(port)
            .into_iter()
            .filter_map(|node| match node {
                Node::Text { text, .. } => Some(text.clone()),
                Node::Node {
                    component, props, ..
                } if component == "textfield" => props
                    .get("value")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                _ => None,
            })
            .collect()
    }
}
