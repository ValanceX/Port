//! Realizing the vocabulary with egui. Every component of `vocabulary.json` becomes a widget; what the person does comes back as reports. A component this PORT does not know is drawn as a visible
//! marker with its children, never dropped (an unknown component is the composer's to notice).
use crate::field::Field;
use crate::port::Report;
use crate::tree::Node;
use egui::{Button, RichText, TextEdit, Ui};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

/// The window's retained state between frames: its text fields.
#[derive(Default)]
pub struct View {
    fields: HashMap<String, Field>,
}

impl View {
    pub fn show(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Report>) {
        match node {
            Node::Text { text, .. } => {
                ui.label(text);
            }
            Node::Node {
                key,
                component,
                props,
                events,
                children,
            } => match component.as_str() {
                "column" => {
                    ui.vertical(|ui| self.each(ui, children, out));
                }
                "row" => {
                    ui.horizontal_wrapped(|ui| self.each(ui, children, out));
                }
                "heading" => {
                    ui.heading(RichText::new(node.text()).strong());
                }
                "text" => {
                    ui.label(node.text());
                }
                "button" => {
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    if ui.add_enabled(enabled, Button::new(node.text())).clicked() {
                        report(events, "click", None, out);
                    }
                }
                "checkbox" => {
                    let mut checked = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    // The engine owns the value: the new value is reported, and the box shows what comes back. A value, not a flip: the same report twice is the same state.
                    if ui.checkbox(&mut checked, "").changed() {
                        report(events, "change", Some(Value::Bool(checked)), out);
                    }
                }
                "textfield" => {
                    let shown = props.get("value").and_then(Value::as_str).unwrap_or("");
                    let hint = props
                        .get("placeholder")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    let field = self
                        .fields
                        .entry(key.clone())
                        .or_insert_with(|| Field::new(shown));

                    field.incoming(shown);

                    if ui
                        .add(
                            TextEdit::singleline(&mut field.buffer)
                                .hint_text(hint)
                                .desired_width(240.0),
                        )
                        .changed()
                    {
                        let text = field.typed();

                        report(events, "change", Some(Value::String(text)), out);
                    }
                }
                other => {
                    ui.vertical(|ui| {
                        ui.colored_label(egui::Color32::LIGHT_RED, format!("<{other}>"));
                        self.each(ui, children, out);
                    });
                }
            },
        }
    }

    fn each(&mut self, ui: &mut Ui, children: &[Node], out: &mut Vec<Report>) {
        for child in children {
            self.show(ui, child, out);
        }
    }

    /// Forgets the fields of a screen that was replaced (a `draw`: nothing is reused).
    pub fn reset(&mut self) {
        self.fields.clear();
    }
}

fn report(
    events: &BTreeMap<String, String>,
    name: &str,
    payload: Option<Value>,
    out: &mut Vec<Report>,
) {
    if let Some(handler) = events.get(name) {
        out.push(Report {
            handler: handler.clone(),
            payload,
        });
    }
}

/// The components this window draws: exactly the ones `vocabulary.json` declares (a test holds the two together).
pub const REALIZED: &[&str] = &[
    "column",
    "row",
    "heading",
    "text",
    "button",
    "checkbox",
    "textfield",
];
