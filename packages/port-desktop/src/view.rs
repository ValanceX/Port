//! Realizing the vocabulary with egui. Every component of `vocabulary.json` becomes a widget; what the person does comes back as reports. A component this PORT does not know is drawn as a visible
//! marker with its children, never dropped (an unknown component is the composer's to notice).
use crate::field::Field;
use crate::port::Report;
use crate::tree::Node;
use egui::{Button, Response, RichText, TextEdit, Ui, WidgetInfo, WidgetType};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

/// What the person did in a frame.
#[derive(Debug, Clone, PartialEq)]
pub enum Output {
    /// An event the tree names a handler for.
    Report(Report),
    /// A link was activated: its address.
    Link(String),
}

/// The accessible name of a control. A control's name is its `label` when the template gives one (a checkbox has no text of its own, and a field's hint is not a name); otherwise the platform
/// reads what the widget shows. `selected` is the state a checkbox reports.
fn named(
    response: &Response,
    kind: WidgetType,
    props: &BTreeMap<String, Value>,
    enabled: bool,
    selected: Option<bool>,
) {
    if let Some(name) = props.get("label").and_then(Value::as_str) {
        let name = name.to_owned();

        response.widget_info(move || match selected {
            Some(on) => WidgetInfo::selected(kind, enabled, on, &name),
            None => WidgetInfo::labeled(kind, enabled, &name),
        });
    }
}

/// The window's retained state between frames: its text fields.
#[derive(Default)]
pub struct View {
    fields: HashMap<String, Field>,
}

impl View {
    pub fn show(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>) {
        self.block(ui, node, out);
    }

    /// A node as a block: it takes the width and a line of its own.
    fn block(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>) {
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
                    let size = match props.get("level").and_then(Value::as_u64) {
                        Some(2) => 20.0,
                        Some(3) => 17.0,
                        _ => 26.0,
                    };

                    ui.horizontal_wrapped(|ui| {
                        no_gap(ui);
                        self.inline_children(ui, children, out, Style::heading(size));
                    });
                }
                "text" => {
                    ui.label(node.text());
                }
                "paragraph" => {
                    ui.horizontal_wrapped(|ui| {
                        no_gap(ui);
                        self.inline_children(ui, children, out, Style::default());
                    });
                }
                "blockquote" => {
                    ui.horizontal(|ui| {
                        let (bar, _) = ui.allocate_exact_size(
                            egui::vec2(3.0, ui.text_style_height(&egui::TextStyle::Body)),
                            egui::Sense::hover(),
                        );

                        ui.painter()
                            .rect_filled(bar, 0.0, ui.visuals().weak_text_color());
                        ui.horizontal_wrapped(|ui| {
                            no_gap(ui);
                            self.inline_children(
                                ui,
                                children,
                                out,
                                Style {
                                    italic: true,
                                    ..Style::default()
                                },
                            );
                        });
                    });
                }
                "code" => {
                    // As a block (its parent is not text): a monospace box. Inside a run of text it is drawn inline by `inline`.
                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.label(RichText::new(node.text()).monospace());
                    });
                }
                "list" => {
                    let ordered = props
                        .get("ordered")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    ui.vertical(|ui| {
                        for (at, item) in children.iter().enumerate() {
                            ui.horizontal_wrapped(|ui| {
                                no_gap(ui);
                                ui.label(if ordered {
                                    format!("{}. ", at + 1)
                                } else {
                                    "\u{2022} ".to_owned()
                                });
                                match item {
                                    Node::Node {
                                        component,
                                        children,
                                        ..
                                    } if component == "listitem" => {
                                        self.inline_children(ui, children, out, Style::default())
                                    }
                                    other => self.inline(ui, other, out, Style::default()),
                                }
                            });
                        }
                    });
                }
                "image" => {
                    // Decoding an image needs a loader this PORT does not carry yet: its description stands in.
                    let label = props.get("label").and_then(Value::as_str).unwrap_or("");

                    egui::Frame::group(ui.style()).show(ui, |ui| {
                        ui.label(RichText::new(format!("[image: {label}]")).weak());
                    });
                }
                "button" => {
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    let response = ui.add_enabled(enabled, Button::new(node.text()));

                    named(&response, WidgetType::Button, props, enabled, None);

                    if response.clicked() {
                        report(events, "click", None, out);
                    }
                }
                "checkbox" => {
                    let mut checked = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    // The engine owns the value: the new value is reported, and the box shows what comes back. A value, not a flip: the same report twice is the same state.
                    let response = ui.checkbox(&mut checked, "");

                    named(&response, WidgetType::Checkbox, props, true, Some(checked));

                    if response.changed() {
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

                    let response = ui.add(
                        TextEdit::singleline(&mut field.buffer)
                            .hint_text(hint)
                            .desired_width(240.0),
                    );

                    named(&response, WidgetType::TextEdit, props, true, None);

                    if response.changed() {
                        let text = field.typed();

                        report(events, "change", Some(Value::String(text)), out);
                    }
                }
                // A run of text used where a block was expected (`strong`, `emphasis`, `link`, `listitem` on their own): drawn as the run it is.
                "strong" | "emphasis" | "link" | "listitem" => {
                    ui.horizontal_wrapped(|ui| {
                        no_gap(ui);
                        self.inline(ui, node, out, Style::default());
                    });
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

    fn each(&mut self, ui: &mut Ui, children: &[Node], out: &mut Vec<Output>) {
        for child in children {
            self.block(ui, child, out);
        }
    }

    fn inline_children(
        &mut self,
        ui: &mut Ui,
        children: &[Node],
        out: &mut Vec<Output>,
        style: Style,
    ) {
        for child in children {
            self.inline(ui, child, out, style);
        }
    }

    /// A node as part of a run of text: it sits beside what is before it, and carries the style it inherits.
    fn inline(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>, style: Style) {
        match node {
            Node::Text { text, .. } => {
                ui.label(style.apply(RichText::new(text)));
            }
            Node::Node {
                component,
                props,
                children,
                ..
            } => match component.as_str() {
                "strong" => self.inline_children(
                    ui,
                    children,
                    out,
                    Style {
                        strong: true,
                        ..style
                    },
                ),
                "emphasis" => self.inline_children(
                    ui,
                    children,
                    out,
                    Style {
                        italic: true,
                        ..style
                    },
                ),
                "code" => {
                    ui.label(
                        style.apply(
                            RichText::new(node.text())
                                .monospace()
                                .background_color(ui.visuals().faint_bg_color),
                        ),
                    );
                }
                "link" => {
                    let href = props.get("href").and_then(Value::as_str).unwrap_or("");

                    if ui.link(style.apply(RichText::new(node.text()))).clicked() {
                        out.push(Output::Link(href.to_owned()));
                    }
                }
                _ => self.block(ui, node, out),
            },
        }
    }

    /// Forgets the fields of a screen that was replaced (a `draw`: nothing is reused).
    pub fn reset(&mut self) {
        self.fields.clear();
    }
}

/// How the text of a run is drawn, and what it inherits from what contains it.
#[derive(Debug, Clone, Copy, Default)]
struct Style {
    strong: bool,
    italic: bool,
    size: Option<f32>,
}

impl Style {
    fn heading(size: f32) -> Style {
        Style {
            strong: true,
            size: Some(size),
            ..Style::default()
        }
    }

    fn apply(self, mut text: RichText) -> RichText {
        if self.strong {
            text = text.strong();
        }
        if self.italic {
            text = text.italics();
        }
        if let Some(size) = self.size {
            text = text.size(size);
        }
        text
    }
}

/// Runs of text sit against each other: the text carries its own spaces.
fn no_gap(ui: &mut Ui) {
    ui.spacing_mut().item_spacing.x = 0.0;
}

fn report(
    events: &BTreeMap<String, String>,
    name: &str,
    payload: Option<Value>,
    out: &mut Vec<Output>,
) {
    if let Some(handler) = events.get(name) {
        out.push(Output::Report(Report {
            handler: handler.clone(),
            payload,
        }));
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

/// The content-layer components this window draws: exactly the ones `content.json` declares.
pub const REALIZED_CONTENT: &[&str] = &[
    "paragraph",
    "list",
    "listitem",
    "code",
    "blockquote",
    "image",
    "strong",
    "emphasis",
    "link",
];
