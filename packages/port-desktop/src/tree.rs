//! MESH's render tree (`render-v1`): the PORT's only data input. The PORT does not redefine, wrap or extend it; these types read what the schema says and ignore what they do not know.
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

/// A node of the tree: a text run, or a component with props, events and children.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Node {
    Text {
        key: String,
        text: String,
    },
    Node {
        key: String,
        component: String,
        #[serde(default)]
        props: BTreeMap<String, Value>,
        /// Event name → the opaque handler identifier to report. Never interpreted.
        #[serde(default)]
        events: BTreeMap<String, String>,
        #[serde(default)]
        children: Vec<Node>,
    },
}

impl Node {
    /// The node's key: its identity across renders.
    pub fn key(&self) -> &str {
        match self {
            Node::Text { key, .. } | Node::Node { key, .. } => key,
        }
    }

    /// A boolean prop of the node (`false` when it has none, or it is not a boolean).
    pub fn bool_prop(&self, name: &str) -> bool {
        match self {
            Node::Node { props, .. } => props.get(name).and_then(Value::as_bool).unwrap_or(false),
            Node::Text { .. } => false,
        }
    }

    /// The text of a node and everything under it: a button's label.
    pub fn text(&self) -> String {
        match self {
            Node::Text { text, .. } => text.clone(),
            Node::Node { children, .. } => children.iter().map(Node::text).collect(),
        }
    }
}

/// A whole `render-v1` tree. `format` and `version` are checked by the PORT before it realizes anything.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Tree {
    pub format: String,
    pub version: u64,
    pub root: Node,
}

pub const FORMAT: &str = "mesh-render";
pub const VERSION: u64 = 1;
