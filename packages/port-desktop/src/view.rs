//! Realizing the vocabulary with egui. Every component of `vocabulary.json` becomes a widget; what the person does comes back as reports. A component this PORT does not know is drawn as a visible
//! marker with its children, never dropped (an unknown component is the composer's to notice).
use crate::field::Field;
use crate::focus::{Asking, Outline};
use crate::port::Report;
use crate::theme::{self, Border, Theme};
use crate::tree::Node;
use egui::{Button, Response, RichText, TextEdit, Ui, WidgetInfo, WidgetType};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::Arc;

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
    caption: Option<&str>,
) {
    // The `label` the template gives, else the caption of the `label` the control is inside.
    if let Some(name) = props.get("label").and_then(Value::as_str).or(caption) {
        let name = name.to_owned();

        response.widget_info(move || match selected {
            Some(on) => WidgetInfo::selected(kind, enabled, on, &name),
            None => WidgetInfo::labeled(kind, enabled, &name),
        });
    }
}

/// What a control says about itself beyond its name: that its value is not acceptable (`invalid`: outlined, and invalid to the accessibility tree) and what explains it (`describedby`: the text
/// of the node with that `id`, as the control's accessible description). `described` is the frame's `id` → text.
fn marked(
    described: &HashMap<String, String>,
    ui: &Ui,
    response: &Response,
    props: &BTreeMap<String, Value>,
) {
    let invalid = props
        .get("invalid")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let description = props
        .get("describedby")
        .and_then(Value::as_str)
        .and_then(|id| described.get(id))
        .cloned();

    if invalid {
        ui.painter().rect_stroke(
            response.rect.expand(2.0),
            3.0,
            egui::Stroke::new(1.5_f32, egui::Color32::from_rgb(200, 40, 30)),
            egui::StrokeKind::Outside,
        );
    }

    if invalid || description.is_some() {
        ui.ctx().accesskit_node_builder(response.id, |node| {
            if invalid {
                node.set_invalid(egui::accesskit::Invalid::True);
            }
            if let Some(text) = description {
                node.set_description(text);
            }
        });
    }
}

/// What the window knows about keyboard focus between frames (decisions I2, I10, I13).
#[derive(Default)]
struct Focusing {
    /// What the window has been asked for focus.
    asking: Asking,
    /// The key of the widget that has focus in this frame so far, and the one that had it in the last: when that node is gone, focus goes to its heir.
    focused: Option<String>,
    had: Option<String>,
    /// The shape of the last frame's tree.
    outline: Outline,
    /// The widget that took focus-order place last in this frame, so Shift+Tab out of a group has somewhere to go.
    last: Option<egui::Id>,
    /// The radios of the groups drawn this frame, and the one of each that is the tab stop (roving focus).
    members: HashSet<String>,
    stops: HashSet<String>,
    /// Tab left a group with nowhere to go on to: the frame's end wraps it.
    wrapping: Option<Leaving>,
    /// How many modal dialogs the drawing is inside: Tab in a dialog is the dialog's, so it does not leave it (the pattern), and egui must not spend it.
    modal_depth: usize,
    /// The tab stops of the last frame's radio groups, to know what Tab reaches.
    last_members: HashSet<String>,
    last_stops: HashSet<String>,
}

/// What the window remembers of a layer between frames.
#[derive(Default)]
struct Remembered {
    open: bool,
    /// The key of the part that had focus when the layer opened: focus returns to it when it closes.
    invoker: Option<String>,
}

impl Focusing {
    /// A widget that takes focus has been drawn for `key`: gives it focus when it was asked for, and remembers that it has it.
    fn widget(&mut self, key: &str, response: &Response) {
        if self.asking.is_for(key) {
            response.request_focus();
        }

        if response.has_focus() {
            self.focused = Some(key.to_owned());

            // Inside a modal dialog Tab is the dialog's, and Escape asks to close it: egui must not move focus away with either.
            if self.modal_depth > 0 {
                response.ctx.memory_mut(|memory| {
                    memory.set_focus_lock_filter(
                        response.id,
                        egui::EventFilter {
                            tab: true,
                            escape: true,
                            ..Default::default()
                        },
                    )
                });
            }
        }

        self.last = Some(response.id);
    }
}

/// Which way the person pressed Tab in a group.
#[derive(Debug, PartialEq, Clone, Copy)]
enum Leaving {
    Forward,
    Back,
}

/// The radios of a group in order: its children, and what a `label` in it holds.
fn radios_of(children: &[Node]) -> Vec<&Node> {
    let mut found = Vec::new();

    for child in children {
        if let Node::Node {
            component,
            children,
            ..
        } = child
        {
            match component.as_str() {
                "radio" => found.push(child),
                "label" => found.extend(radios_of(children)),
                _ => {}
            }
        }
    }

    found
}

/// A radio button: the toolkit's own (`egui::RadioButton`), except that it is reached by Tab only when it is the `tab_stop` of its group, which the toolkit's cannot be told. A radio that is not
/// the stop still senses clicks and is given focus by the arrow keys of the group.
fn radio_button(ui: &mut Ui, checked: bool, text: &str, tab_stop: bool) -> Response {
    let spacing = ui.spacing();
    let icon_width = spacing.icon_width;
    let icon_spacing = spacing.icon_spacing;
    let (galley, mut desired_size) = if text.is_empty() {
        (None, egui::vec2(icon_width, 0.0))
    } else {
        let extra = egui::vec2(icon_width + icon_spacing, 0.0);
        let galley = egui::WidgetText::from(text).into_galley(
            ui,
            None,
            ui.available_width() - extra.x,
            egui::TextStyle::Button,
        );
        let size = (extra + galley.size()).max(spacing.interact_size);

        (Some(galley), size)
    };

    desired_size = desired_size.max(egui::Vec2::splat(ui.spacing().interact_size.y));
    desired_size.y = desired_size.y.max(icon_width);

    let sense = if tab_stop {
        egui::Sense::click()
    } else {
        egui::Sense::CLICK
    };
    let (rect, response) = ui.allocate_exact_size(desired_size, sense);

    response.widget_info(|| {
        WidgetInfo::selected(
            WidgetType::RadioButton,
            ui.is_enabled(),
            checked,
            galley.as_ref().map_or("", |galley| galley.text()),
        )
    });

    if ui.is_rect_visible(rect) {
        let visuals = ui.style().interact(&response);
        let (small, big) = ui.spacing().icon_rectangles(rect);
        let painter = ui.painter();

        painter.add(egui::epaint::CircleShape {
            center: big.center(),
            radius: big.width() / 2.0 + visuals.expansion,
            fill: visuals.bg_fill,
            stroke: visuals.bg_stroke,
        });

        if checked {
            painter.add(egui::epaint::CircleShape {
                center: small.center(),
                radius: small.width() / 3.0,
                fill: visuals.fg_stroke.color,
                stroke: Default::default(),
            });
        }

        if let Some(galley) = galley {
            let at = egui::pos2(
                rect.min.x + icon_width + icon_spacing,
                rect.center().y - 0.5 * galley.size().y,
            );

            ui.painter().galley(at, galley, visuals.text_color());
        }
    }

    response
}

/// Whether a component is a widget that takes keyboard focus (an inline link does too, and is not followed here).
fn takes_focus(component: &str) -> bool {
    matches!(
        component,
        "button" | "toggle" | "checkbox" | "textfield" | "radio"
    )
}

/// Draws in a scope whose widget ids come from `key` and nothing else (decision I16). egui gives a widget the id of its place: a child `Ui` seeds its automatic ids from its parent's counter, so
/// `push_id` keeps `ui.id()` stable but not the ids of the buttons and boxes inside it, and a row that moves would be a new widget with a new accessibility node and no focus. A `Ui` made by
/// `Ui::new` seeds them from its own id, so this makes one from the parent's id and the key, with what a child scope takes from its parent: its layout, style, clip, enabled state and room;
/// the parent then accounts for the space it used, as `scope` does.
fn keyed<R>(ui: &mut Ui, key: &str, add: impl FnOnce(&mut Ui) -> R) -> R {
    let builder = egui::UiBuilder::new()
        .layer_id(ui.layer_id())
        .max_rect(ui.available_rect_before_wrap())
        .layout(*ui.layout())
        .style(ui.style().clone());
    let mut child = Ui::new(ui.ctx().clone(), ui.id().with(("key", key)), builder);

    child.set_clip_rect(ui.clip_rect());

    if !ui.is_enabled() {
        child.disable();
    }

    let result = add(&mut child);

    ui.allocate_rect(child.min_rect(), egui::Sense::hover());

    result
}

/// The kinds of image file the window decodes.
const IMAGE_KINDS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"];

/// The URI of a local image file, or `None`: the engine names a file by its absolute path (an address or a relative path is not one), of a kind the window decodes, that exists.
fn local_image(src: &str) -> Option<String> {
    let path = std::path::Path::new(src);
    let kind = path.extension()?.to_str()?.to_ascii_lowercase();

    if !path.is_absolute() || !IMAGE_KINDS.contains(&kind.as_str()) || !path.is_file() {
        return None;
    }

    Some(format!("file://{}", src.replace('\\', "/")))
}

/// The window's retained state between frames: its text fields.
#[derive(Default)]
pub struct View {
    fields: HashMap<String, Field>,
    /// The text of every node that has an `id`, for the controls that name it as `describedby`. Gathered at the start of each frame from the tree being drawn.
    described: HashMap<String, String>,
    /// The caption of the `label` being drawn: the one control inside it takes it as its visible text and its accessible name.
    caption: Option<String>,
    /// The theme the engine gave the window, resolved: what each primitive of the portable core looks like. Absent: the toolkit's own look.
    theme: Option<Arc<Theme>>,
    /// The key of the widget that had focus in the last frame, and the shape of that frame's tree: when the node is gone, focus goes to its heir (decision I2).
    focus: Focusing,
    /// The layers (dialogs and popovers) as the last frame left them, by the node's key.
    layers: HashMap<String, Remembered>,
    /// Where nodes that have an `id` were drawn in the last frame, and in this one: what a popover is anchored to.
    rects: HashMap<String, egui::Rect>,
    rects_now: HashMap<String, egui::Rect>,
    /// The roving tab stop of each radio group, by the group's key (decision I10: one tab stop, the arrows move it).
    roving: HashMap<String, Roving>,
}

/// Which radio of a group is its tab stop, and which was the checked one when that was last looked at (the stop follows the application's choice when it changes).
#[derive(Default)]
struct Roving {
    stop: Option<String>,
    checked: Option<String>,
}

impl View {
    /// The theme the engine gave the window (or none).
    pub fn set_theme(&mut self, theme: Option<Arc<Theme>>) {
        self.theme = theme;
    }

    /// What the theme says of a primitive in the window as it is now: its mode is the toolkit's (light or dark) and its viewport is the window's width. Nothing when there is no theme.
    fn themed(
        &self,
        ui: &Ui,
        primitive: &str,
        props: &BTreeMap<String, Value>,
        states: &[&str],
    ) -> theme::Style {
        let Some(theme) = &self.theme else {
            return theme::Style::default();
        };
        let mode = if ui.visuals().dark_mode {
            "dark"
        } else {
            "light"
        };
        let given = |name: &str| props.get(name).and_then(Value::as_str).map(str::to_owned);

        theme.style(
            mode,
            primitive,
            &given,
            states,
            ui.ctx().screen_rect().width(),
        )
    }

    pub fn show(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>) {
        self.described.clear();
        gather(node, &mut self.described);

        // A node that has focus and is gone from this frame's tree hands it on; one that only moved keeps it by its id (decision I16).
        let now = Outline::of(node);

        // A layer the application no longer has open (closed, or gone from the tree) hands focus back to what opened it, before this frame draws what comes after the invoker: for a popover only when
        // focus was inside it.
        let closed: Vec<String> = self
            .layers
            .iter()
            .filter(|(key, remembered)| remembered.open && !now.is_open(key))
            .map(|(key, _)| key.clone())
            .collect();

        for key in closed {
            let modal = self.focus.outline.is_dialog(&key);
            let inside = self
                .focus
                .focused
                .as_ref()
                .is_some_and(|had| self.focus.outline.is_within(had, &key));
            let invoker = self.layers.get_mut(&key).and_then(|remembered| {
                remembered.open = false;
                remembered.invoker.take()
            });

            if modal || inside {
                self.return_focus(invoker, &key, &now);
            }

            if !now.contains(&key) {
                self.layers.remove(&key);
            }
        }

        self.focus.last_members = std::mem::take(&mut self.focus.members);
        self.focus.last_stops = std::mem::take(&mut self.focus.stops);
        self.rects = std::mem::take(&mut self.rects_now);
        self.focus.had = self.focus.focused.take();
        self.focus.last = None;

        if let Some(gone) = self.focus.had.clone().filter(|key| !now.contains(key)) {
            if let Some(heir) = self.focus.outline.heir(&gone, &now) {
                self.focus.asking.ask(&heir);
            }
        }

        self.block(ui, node, out);

        // Tab went on from the last (or back from the first) widget that takes focus: it wraps, as the toolkit's own does.
        let unmet = self.focus.asking.end_frame();

        if let Some(wrapping) = self.focus.wrapping.take() {
            let reachable =
                |key: &str| !self.focus.members.contains(key) || self.focus.stops.contains(key);
            let order = now.in_order(&reachable);
            let target = match wrapping {
                Leaving::Forward if unmet => order.first(),
                Leaving::Back => order.last(),
                _ => None,
            };

            if let Some(target) = target {
                self.focus.asking.ask(target);
            }
        }

        self.focus.outline = now;
    }

    /// Asks for focus on the part `key` names, or the first thing in it that takes focus, in the next frame drawn (decision I13). Nothing is reported.
    pub fn focus(&mut self, key: &str) {
        self.focus.asking.ask(key);
    }

    /// A node as a block: it takes the width and a line of its own. Its widgets' ids come from its key (decision I16): a node that keeps its identity keeps its widget, its accessibility
    /// node, its focus and whatever the toolkit remembers by id (a text field's cursor, a scroll position, an open section), wherever the tree puts it next frame.
    fn block(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>) {
        match node {
            Node::Text { text, .. } => {
                ui.label(text);
            }
            Node::Node {
                key,
                component,
                props,
                ..
            } => {
                let seeking = self.focus.asking.enter(key, takes_focus(component));
                let mut used = egui::Rect::NOTHING;

                keyed(ui, key, |ui| {
                    self.draw(ui, node, out);
                    used = ui.min_rect();
                });

                if let Some(id) = props.get("id").and_then(Value::as_str) {
                    self.rects_now.insert(id.to_owned(), used);
                }

                if seeking {
                    self.focus.asking.leave();
                }
            }
        }
    }

    /// A component node, drawn in the scope its key makes.
    fn draw(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<Output>) {
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
                    let gap = self.themed(ui, "column", props, &[]).gap;

                    ui.scope(|ui| {
                        if let Some(gap) = gap {
                            ui.spacing_mut().item_spacing.y = gap;
                        }
                        ui.vertical(|ui| self.each(ui, children, out));
                    });
                }
                "row" => {
                    let gap = self.themed(ui, "row", props, &[]).gap;

                    ui.scope(|ui| {
                        if let Some(gap) = gap {
                            ui.spacing_mut().item_spacing = egui::vec2(gap, gap);
                        }
                        ui.horizontal_wrapped(|ui| self.each(ui, children, out));
                    });
                }
                "heading" => {
                    let themed = self.themed(ui, "heading", props, &[]);
                    let size = themed.font_size.unwrap_or(
                        match props.get("level").and_then(Value::as_u64) {
                            Some(2) => 20.0,
                            Some(3) => 17.0,
                            _ => 26.0,
                        },
                    );

                    let level = match props.get("level").and_then(Value::as_u64) {
                        Some(level @ 1..=6) => level as usize,
                        _ => 1,
                    };
                    let id = ui.make_persistent_id(("heading", key));

                    // egui draws a heading as labels and never emits the role (decision A11): the PORT sets Heading with its level, and its text, drawn inside it, is its name (the specification's name from content).
                    ui.ctx().accesskit_node_builder(id, |builder| {
                        builder.set_role(egui::accesskit::Role::Heading);
                        builder.set_level(level);
                    });

                    let ctx = ui.ctx().clone();

                    ctx.with_accessibility_parent(id, || {
                        ui.horizontal_wrapped(|ui| {
                            no_gap(ui);
                            self.inline_children(
                                ui,
                                children,
                                out,
                                Style::heading(size).themed(&themed),
                            );
                        });
                    });
                }
                "text" => {
                    let themed = self.themed(ui, "text", props, &[]);

                    ui.label(
                        Style::default()
                            .themed(&themed)
                            .apply(RichText::new(node.text())),
                    );
                }
                "paragraph" => {
                    let id = ui.make_persistent_id(("paragraph", key));

                    ui.ctx().accesskit_node_builder(id, |builder| {
                        builder.set_role(egui::accesskit::Role::Paragraph);
                    });

                    let ctx = ui.ctx().clone();

                    ctx.with_accessibility_parent(id, || {
                        ui.horizontal_wrapped(|ui| {
                            no_gap(ui);
                            self.inline_children(ui, children, out, Style::default());
                        });
                    });
                }
                "blockquote" => {
                    let id = ui.make_persistent_id(("blockquote", key));

                    // Role::Blockquote (decision A11): the web renders `blockquote`, ARIA defines the role and AccessKit 0.17 has it; egui never emits it. The bar is decoration.
                    ui.ctx().accesskit_node_builder(id, |builder| {
                        builder.set_role(egui::accesskit::Role::Blockquote);
                    });

                    let ctx = ui.ctx().clone();

                    ctx.with_accessibility_parent(id, || {
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
                    let size = children.len();
                    let list_id = ui.make_persistent_id(("list", key));

                    // The roles egui never emits (decision A11). Each item's nodes are children of the item's, and the items are children of the list's, as `with_accessibility_parent` makes them.
                    ui.ctx().accesskit_node_builder(list_id, |builder| {
                        builder.set_role(egui::accesskit::Role::List);
                    });

                    let ctx = ui.ctx().clone();

                    ctx.with_accessibility_parent(list_id, || {
                        ui.vertical(|ui| {
                            for (at, item) in children.iter().enumerate() {
                                let item_id = list_id.with(("item", item.key()));

                                ui.ctx().accesskit_node_builder(item_id, |builder| {
                                    builder.set_role(egui::accesskit::Role::ListItem);
                                    builder.set_position_in_set(at + 1);
                                    builder.set_size_of_set(size);
                                });
                                ctx.with_accessibility_parent(item_id, || {
                                    keyed(ui, item.key(), |ui| {
                                        ui.horizontal_wrapped(|ui| {
                                            no_gap(ui);
                                            // The bullet or number is decoration: the item is its text alone. Hidden, so an assistive technology does not read "bullet" before it.
                                            let marker = ui.label(if ordered {
                                                format!("{}. ", at + 1)
                                            } else {
                                                "\u{2022} ".to_owned()
                                            });

                                            ui.ctx().accesskit_node_builder(marker.id, |builder| {
                                                builder.set_hidden();
                                            });
                                            match item {
                                                Node::Node {
                                                    component,
                                                    children,
                                                    ..
                                                } if component == "listitem" => self
                                                    .inline_children(
                                                        ui,
                                                        children,
                                                        out,
                                                        Style::default(),
                                                    ),
                                                other => {
                                                    self.inline(ui, other, out, Style::default())
                                                }
                                            }
                                        })
                                    });
                                });
                            }
                        });
                    });
                }
                "image" => {
                    let label = props.get("label").and_then(Value::as_str).unwrap_or("");
                    let src = props.get("src").and_then(Value::as_str).unwrap_or("");

                    match local_image(src) {
                        // A file on this machine the engine named, of a kind the PORT decodes: drawn, named for assistive technology by its description.
                        Some(uri) => {
                            ui.add(
                                egui::Image::new(uri)
                                    .max_width(480.0)
                                    .alt_text(label.to_owned()),
                            );
                        }
                        // Anything else (an address on the network, a vector image, a file that is not there): the description stands in. The PORT fetches nothing.
                        None => {
                            egui::Frame::group(ui.style()).show(ui, |ui| {
                                ui.label(RichText::new(format!("[image: {label}]")).weak());
                            });
                        }
                    }
                }
                "button" => {
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    let themed = self.themed(
                        ui,
                        "button",
                        props,
                        if enabled { &[] } else { &["disabled"] },
                    );
                    let label = Style::default()
                        .themed(&themed)
                        .apply(RichText::new(node.text()));
                    let response = themed_button(ui, enabled, Button::new(label), &themed);

                    named(&response, WidgetType::Button, props, enabled, None, None);
                    self.focus.widget(key, &response);

                    if response.clicked() {
                        report(events, "click", None, out);
                    }
                }
                // A button that stays pressed (`pressed` is the application's, and a click reports the value it is going to have). Its role is Button and its pressed state is the tree's toggled state;
                // its name is its `label`, else the text drawn in it.
                "toggle" => {
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let pressed = props
                        .get("pressed")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let text = node.text();
                    let name = props
                        .get("label")
                        .and_then(Value::as_str)
                        .map_or_else(|| text.clone(), str::to_owned);
                    let response = ui.add_enabled(enabled, Button::new(text).selected(pressed));

                    response.widget_info(move || {
                        WidgetInfo::selected(WidgetType::Button, enabled, pressed, &name)
                    });
                    self.focus.widget(key, &response);

                    if response.clicked() {
                        report(events, "change", Some(Value::Bool(!pressed)), out);
                    }
                }
                // A modal layer (decisions I4, I5, I10): egui's `Modal`, which blocks the pointer behind it and limits focus to itself. What it lacks the PORT supplies: focus moves inside when it opens,
                // Tab wraps, and focus returns to the part that opened it (by key) when it closes. It is drawn only while the application has it open, and it asks to close (`dismiss`, with the reason
                // `escape` or `outside`); it stays open until the application says otherwise.
                "dialog" => {
                    let open = props.get("open").and_then(Value::as_bool).unwrap_or(false);
                    let id = ui.make_persistent_id(("dialog", key));

                    if !open {
                        return;
                    }

                    let remembered = self.layers.entry(key.clone()).or_default();

                    if !remembered.open {
                        // opening: remember who had focus, and give it to the first thing that takes it inside
                        remembered.open = true;
                        remembered.invoker = self
                            .focus
                            .had
                            .clone()
                            .filter(|had| !self.focus.outline.is_within(had, key));
                        self.focus.asking.ask(key);
                    }

                    // Tab and Shift+Tab are the dialog's while focus is in it: they wrap, and never leave (the APG modal dialog pattern).
                    if let Some(target) = self.wrap_in_dialog(ui, key) {
                        self.focus.asking.ask(&target);
                    }

                    let name = props
                        .get("label")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    let ctx = ui.ctx().clone();
                    let seeking = self.focus.asking.enter(key, false);

                    self.focus.modal_depth += 1;

                    let shown = egui::Modal::new(id).show(&ctx, |ui| {
                        ui.ctx().accesskit_node_builder(id, |builder| {
                            builder.set_role(egui::accesskit::Role::Dialog);
                            builder.set_modal();

                            if let Some(name) = name {
                                builder.set_label(name);
                            }
                        });
                        ctx.with_accessibility_parent(id, || {
                            ui.vertical(|ui| self.each(ui, children, out));
                        });
                    });

                    self.focus.modal_depth -= 1;

                    if seeking {
                        self.focus.asking.leave();
                    }

                    if shown.should_close() {
                        let reason = if shown.backdrop_response.clicked() {
                            "outside"
                        } else {
                            "escape"
                        };

                        report(
                            events,
                            "dismiss",
                            Some(Value::String(reason.to_owned())),
                            out,
                        );
                    }
                }
                // A layer that is not modal, drawn above the content beside the part it is anchored to (the `id` its `anchor` names), by `placement`. `auto` (the default) is light-dismissed: a click
                // outside it, or Escape, asks to close; `manual` is closed only by the application. Opening does not move focus; closing returns it to the invoker when it was inside.
                "popover" => {
                    let open = props.get("open").and_then(Value::as_bool).unwrap_or(false);
                    let manual = props.get("kind").and_then(Value::as_str) == Some("manual");
                    let id = ui.make_persistent_id(("popover", key));

                    if !open {
                        return;
                    }

                    let remembered = self.layers.entry(key.clone()).or_default();

                    if !remembered.open {
                        remembered.open = true;
                        remembered.invoker = self
                            .focus
                            .had
                            .clone()
                            .filter(|had| !self.focus.outline.is_within(had, key));
                    }

                    let anchor = props
                        .get("anchor")
                        .and_then(Value::as_str)
                        .and_then(|name| self.rects.get(name))
                        .copied();
                    let (pivot, at) = match (props.get("placement").and_then(Value::as_str), anchor)
                    {
                        (Some("top"), Some(rect)) => {
                            (egui::Align2::CENTER_BOTTOM, rect.center_top())
                        }
                        (Some("start"), Some(rect)) => {
                            (egui::Align2::RIGHT_CENTER, rect.left_center())
                        }
                        (Some("end"), Some(rect)) => {
                            (egui::Align2::LEFT_CENTER, rect.right_center())
                        }
                        (_, Some(rect)) => (egui::Align2::CENTER_TOP, rect.center_bottom()),
                        (_, None) => (egui::Align2::CENTER_CENTER, ui.ctx().screen_rect().center()),
                    };
                    let name = props
                        .get("label")
                        .and_then(Value::as_str)
                        .map(str::to_owned);
                    let ctx = ui.ctx().clone();
                    let shown = egui::Area::new(id)
                        .order(egui::Order::Foreground)
                        .pivot(pivot)
                        .fixed_pos(at)
                        .show(&ctx, |ui| {
                            egui::Frame::popup(ui.style()).show(ui, |ui| {
                                ui.ctx().accesskit_node_builder(id, |builder| {
                                    builder.set_role(egui::accesskit::Role::GenericContainer);

                                    if let Some(name) = name {
                                        builder.set_label(name);
                                    }
                                });
                                ctx.with_accessibility_parent(id, || {
                                    ui.vertical(|ui| self.each(ui, children, out));
                                });
                            });
                        });

                    if !manual {
                        let clicked_away = ctx.input(|input| input.pointer.any_pressed())
                            && ctx
                                .input(|input| input.pointer.interact_pos())
                                .is_some_and(|pos| !shown.response.rect.contains(pos));
                        let escaped = ctx.input_mut(|input| {
                            input.consume_key(egui::Modifiers::NONE, egui::Key::Escape)
                        });

                        if escaped || clicked_away {
                            report(
                                events,
                                "dismiss",
                                Some(Value::String(
                                    if escaped { "escape" } else { "outside" }.to_owned(),
                                )),
                                out,
                            );
                        }
                    }
                }
                // A group of radios: the options in a column, the group named for assistive technology by its `label`. It has no events; its radios raise them.
                "radiogroup" => {
                    let radios = radios_of(children);
                    let leaving = self.rove(ui, key, &radios, out);
                    let response = ui.vertical(|ui| self.each(ui, children, out)).response;
                    let name = props
                        .get("label")
                        .and_then(Value::as_str)
                        .map(str::to_owned);

                    ui.ctx().accesskit_node_builder(response.id, |builder| {
                        builder.set_role(egui::accesskit::Role::RadioGroup);

                        if let Some(name) = name {
                            builder.set_label(name);
                        }
                    });
                    marked(&self.described, ui, &response, props);

                    // Tab in a group leaves it: forward to the next widget drawn that takes focus.
                    if leaving == Some(Leaving::Forward) {
                        self.focus.asking.seek_next();
                        self.focus.wrapping = Some(Leaving::Forward);
                    }
                }
                // A live region (decision A13): the text inside is the message. `status` is polite and `alert` assertive, both atomic, which is what `role=status` and `role=alert` imply in ARIA;
                // egui sets neither role, so the PORT does. The region is a node even with nothing in it, because a region has to exist before its text changes to be announced.
                "status" | "alert" => {
                    let alert = component.as_str() == "alert";
                    let id = ui.make_persistent_id((component.as_str(), key));

                    ui.ctx().accesskit_node_builder(id, |builder| {
                        builder.set_role(if alert {
                            egui::accesskit::Role::Alert
                        } else {
                            egui::accesskit::Role::Status
                        });
                        builder.set_live(if alert {
                            egui::accesskit::Live::Assertive
                        } else {
                            egui::accesskit::Live::Polite
                        });
                        builder.set_live_atomic();
                    });

                    let ctx = ui.ctx().clone();

                    ctx.with_accessibility_parent(id, || {
                        ui.vertical(|ui| self.each(ui, children, out));
                    });
                }
                // One option: the engine owns the selection. Choosing an option that is not the selected one reports `select` with its `value`; the radio then shows whatever comes back.
                "radio" => {
                    let checked = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let caption = self.caption.take();
                    let text = props
                        .get("label")
                        .and_then(Value::as_str)
                        .or(caption.as_deref())
                        .unwrap_or("");
                    // In a group only the tab stop is reached by Tab; the arrows move the stop (APG radio group pattern, decision I10).
                    let in_group = self.focus.members.contains(key);
                    let tab_stop = !in_group || self.focus.stops.contains(key);
                    let response = ui
                        .add_enabled_ui(enabled, |ui| radio_button(ui, checked, text, tab_stop))
                        .inner;

                    if in_group && response.has_focus() {
                        // Tab and the arrows are the group's while one of its radios has focus: egui must not spend them moving focus by itself.
                        ui.memory_mut(|memory| {
                            memory.set_focus_lock_filter(
                                response.id,
                                egui::EventFilter {
                                    tab: true,
                                    horizontal_arrows: true,
                                    vertical_arrows: true,
                                    escape: false,
                                },
                            )
                        });
                    }

                    named(
                        &response,
                        WidgetType::RadioButton,
                        props,
                        enabled,
                        Some(checked),
                        caption.as_deref(),
                    );
                    self.focus.widget(key, &response);

                    if response.clicked() && !checked {
                        let value = props.get("value").and_then(Value::as_str).unwrap_or("");

                        report(events, "select", Some(Value::String(value.to_owned())), out);
                    }
                }
                // A static table: rows and columns with header meaning (docs/application-model/TABLE.md in the Valance repository). One grid for the whole table; the accessibility tree has
                // the table, its rows and cells, with counts and indices, which the toolkit's grid does not provide.
                "table" => self.table(ui, key, props, children, out),
                // Outside a table, its parts still draw: rows as a line of cells, a cell as its content.
                "tablehead" | "tablebody" => self.each(ui, children, out),
                "tablerow" => {
                    ui.horizontal_wrapped(|ui| self.each(ui, children, out));
                }
                "columnheader" | "rowheader" | "cell" => {
                    let style = Style {
                        strong: component != "cell",
                        ..Style::default()
                    };

                    ui.horizontal_wrapped(|ui| self.inline_children(ui, children, out, style));
                }
                // A caption and the control it names: the text is the control's visible text and accessible name, and a click on it does what a click on the control does. The caption is the text
                // written directly inside; the control is whatever else is written there.
                "label" => {
                    let caption: String = children
                        .iter()
                        .filter(|child| matches!(child, Node::Text { .. }))
                        .map(Node::text)
                        .collect::<String>()
                        .trim()
                        .to_owned();

                    ui.horizontal(|ui| {
                        for child in children {
                            if matches!(child, Node::Text { .. }) {
                                continue;
                            }

                            self.caption = Some(caption.clone()).filter(|text| !text.is_empty());
                            self.block(ui, child, out);
                            self.caption = None;
                        }
                    });
                }
                "checkbox" => {
                    let mut checked = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    // The engine owns the value: the new value is reported, and the box shows what comes back. A value, not a flip: the same report twice is the same state.
                    let caption = self.caption.take();
                    let themed = self.themed(ui, "checkbox", props, &[]);
                    let response = ui
                        .scope(|ui| {
                            // the box is as large as the theme says (its minimum size)
                            if let Some(size) = themed.min_size {
                                ui.spacing_mut().icon_width = size;
                            }
                            ui.checkbox(&mut checked, caption.as_deref().unwrap_or(""))
                        })
                        .inner;

                    named(
                        &response,
                        WidgetType::Checkbox,
                        props,
                        true,
                        Some(checked),
                        caption.as_deref(),
                    );
                    marked(&self.described, ui, &response, props);
                    self.focus.widget(key, &response);

                    if response.changed() {
                        report(events, "change", Some(Value::Bool(checked)), out);
                    }
                }
                "textfield" => {
                    let shown = props.get("value").and_then(Value::as_str).unwrap_or("");
                    let invalid = props.get("invalid").and_then(Value::as_bool) == Some(true);
                    let themed = self.themed(
                        ui,
                        "textfield",
                        props,
                        if invalid { &["invalid"] } else { &[] },
                    );
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

                    // Inside a `label`, the caption is drawn before the field, and a click on it puts the cursor in the field.
                    let caption = self.caption.take();
                    let captioned = caption.as_ref().map(|text| {
                        ui.add(egui::Label::new(text.as_str()).sense(egui::Sense::click()))
                    });

                    // `kind="password"` masks what is shown; every other kind is plain text here.
                    let masked = props.get("kind").and_then(Value::as_str) == Some("password");
                    let response = themed_field(
                        ui,
                        TextEdit::singleline(&mut field.buffer)
                            .hint_text(hint)
                            .password(masked)
                            .desired_width(240.0),
                        &themed,
                    );

                    named(
                        &response,
                        WidgetType::TextEdit,
                        props,
                        true,
                        None,
                        caption.as_deref(),
                    );
                    marked(&self.described, ui, &response, props);
                    self.focus.widget(key, &response);

                    if let Some(caption) = captioned {
                        if caption.clicked() {
                            response.request_focus();
                        }
                    }

                    // The person came into the field.
                    if response.gained_focus() {
                        report(events, "focus", None, out);
                    }

                    // Enter in a single-line field takes it out of focus: that is the person submitting what they typed.
                    if response.lost_focus()
                        && ui.input(|input| input.key_pressed(egui::Key::Enter))
                    {
                        report(events, "submit", None, out);
                    }

                    // Escape in the field is the person backing out of what they typed: the application decides what that undoes.
                    if response.lost_focus()
                        && ui.input(|input| input.key_pressed(egui::Key::Escape))
                    {
                        report(events, "cancel", None, out);
                    }

                    // The person left the field (after `submit` or `cancel`, when it was Enter or Escape that took the focus).
                    if response.lost_focus() {
                        report(events, "blur", None, out);
                    }

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

    /// The roving focus of a radio group (the APG radio group pattern, decision I10). One radio is the group's tab stop: the checked one, else the first that is enabled; Tab reaches the group at
    /// it and leaves the group from it. While a radio of the group has focus, the arrow keys move focus to the next or previous radio (wrapping), and choose it, which reports `select`
    /// as a click on it would. Returns which way the person pressed Tab, if they did.
    fn rove(
        &mut self,
        ui: &mut Ui,
        group: &str,
        radios: &[&Node],
        out: &mut Vec<Output>,
    ) -> Option<Leaving> {
        let enabled: Vec<&Node> = radios
            .iter()
            .copied()
            .filter(|radio| !radio.bool_prop("disabled"))
            .collect();
        let checked = enabled
            .iter()
            .find(|radio| radio.bool_prop("checked"))
            .map(|radio| radio.key().to_owned());
        let roving = self.roving.entry(group.to_owned()).or_default();

        // The stop follows the application's choice when that changes, and is the first radio when nothing is chosen.
        if roving.checked != checked {
            roving.checked = checked.clone();

            if checked.is_some() {
                roving.stop = checked.clone();
            }
        }

        if !roving
            .stop
            .as_ref()
            .is_some_and(|stop| enabled.iter().any(|radio| radio.key() == stop))
        {
            roving.stop = checked.or_else(|| enabled.first().map(|radio| radio.key().to_owned()));
        }

        for radio in radios {
            self.focus.members.insert(radio.key().to_owned());
        }

        let mut leaving = None;
        let at = self
            .focus
            .had
            .as_ref()
            .and_then(|key| enabled.iter().position(|radio| radio.key() == key));

        if let Some(at) = at {
            let step = ui.input_mut(|input| {
                use egui::{Key, Modifiers};

                if input.consume_key(Modifiers::NONE, Key::ArrowDown)
                    || input.consume_key(Modifiers::NONE, Key::ArrowRight)
                {
                    Some(1)
                } else if input.consume_key(Modifiers::NONE, Key::ArrowUp)
                    || input.consume_key(Modifiers::NONE, Key::ArrowLeft)
                {
                    Some(enabled.len() - 1)
                } else {
                    None
                }
            });

            if let Some(step) = step {
                let target = enabled[(at + step) % enabled.len()];

                roving.stop = Some(target.key().to_owned());
                self.focus.asking.ask(target.key());

                if !target.bool_prop("checked") {
                    if let Node::Node { props, events, .. } = target {
                        let value = props.get("value").and_then(Value::as_str).unwrap_or("");

                        report(events, "select", Some(Value::String(value.to_owned())), out);
                    }
                }
            }

            let tab = ui.input_mut(|input| {
                use egui::{Key, Modifiers};

                if input.consume_key(Modifiers::SHIFT, Key::Tab) {
                    Some(Leaving::Back)
                } else if input.consume_key(Modifiers::NONE, Key::Tab) {
                    Some(Leaving::Forward)
                } else {
                    None
                }
            });

            match tab {
                Some(Leaving::Back) => match self.focus.last {
                    Some(before) => ui.memory_mut(|memory| memory.request_focus(before)),
                    None => self.focus.wrapping = Some(Leaving::Back),
                },
                other => leaving = other,
            }
        }

        if let Some(stop) = &self.roving[group].stop {
            self.focus.stops.insert(stop.clone());
        }

        leaving
    }

    /// Tab or Shift+Tab pressed while focus is inside the dialog `key`: where focus goes, wrapping at the ends. What Tab reaches is what the last frame's tree and radio groups say.
    fn wrap_in_dialog(&mut self, ui: &mut Ui, key: &str) -> Option<String> {
        let had = self
            .focus
            .had
            .clone()
            .filter(|had| self.focus.outline.is_within(had, key))?;
        // Shift+Tab first: the toolkit matches a key logically, so Tab with no modifiers would take it too.
        let backward =
            ui.input_mut(|input| input.consume_key(egui::Modifiers::SHIFT, egui::Key::Tab));
        let forward = !backward
            && ui.input_mut(|input| input.consume_key(egui::Modifiers::NONE, egui::Key::Tab));

        if !forward && !backward {
            return None;
        }

        let (members, stops) = (&self.focus.last_members, &self.focus.last_stops);
        let order = self.focus.outline.in_order(&|each| {
            self.focus.outline.is_within(each, key)
                && (!members.contains(each) || stops.contains(each))
        });
        let at = order.iter().position(|each| *each == had)?;

        Some(if forward {
            order[(at + 1) % order.len()].clone()
        } else {
            order[(at + order.len() - 1) % order.len()].clone()
        })
    }

    /// Focus goes back to `invoker` when a layer closes; when that is gone, to what follows it, then what precedes it, then what holds it (as for any part that leaves).
    fn return_focus(&mut self, invoker: Option<String>, layer: &str, now: &Outline) {
        match invoker {
            Some(invoker) if now.contains(&invoker) && now.holds_focus(&invoker) => {
                self.focus.asking.ask(&invoker)
            }
            // the invoker is gone: what follows it, then what precedes it, then what holds the layer (the pattern: "another element that provides logical work flow")
            other => {
                let heir = other
                    .and_then(|invoker| self.focus.outline.heir(&invoker, now))
                    .or_else(|| now.parent_of(layer).map(str::to_owned));

                if let Some(heir) = heir {
                    self.focus.asking.ask(&heir);
                }
            }
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

    /// A table: its rows (the header rows of `tablehead` first, as written) in one grid, each cell's content beside its header's style.
    fn table(
        &mut self,
        ui: &mut Ui,
        key: &str,
        props: &BTreeMap<String, Value>,
        children: &[Node],
        out: &mut Vec<Output>,
    ) {
        let mut rows: Vec<(bool, &Node)> = Vec::new();

        for child in children {
            if let Node::Node {
                component,
                children: inside,
                ..
            } = child
            {
                match component.as_str() {
                    "tablehead" | "tablebody" => {
                        rows.extend(inside.iter().map(|row| (component == "tablehead", row)))
                    }
                    "tablerow" => rows.push((false, child)),
                    _ => {}
                }
            }
        }

        let cells_of = |row: &Node| -> Vec<Node> {
            match row {
                Node::Node { children, .. } => children
                    .iter()
                    .filter(|cell| {
                        matches!(cell, Node::Node { component, .. }
                            if matches!(component.as_str(), "cell" | "columnheader" | "rowheader"))
                    })
                    .cloned()
                    .collect(),
                Node::Text { .. } => Vec::new(),
            }
        };
        let columns = rows
            .iter()
            .map(|(_, row)| cells_of(row).len())
            .max()
            .unwrap_or(0);
        let table_id = ui.make_persistent_id(("table", key));
        let name = props
            .get("label")
            .and_then(Value::as_str)
            .map(str::to_owned);
        let count = rows.len();

        ui.ctx().accesskit_node_builder(table_id, |builder| {
            builder.set_role(egui::accesskit::Role::Table);
            builder.set_row_count(count);
            builder.set_column_count(columns);

            if let Some(name) = name {
                builder.set_label(name);
            }
        });

        let ctx = ui.ctx().clone();

        ctx.with_accessibility_parent(table_id, || {
            egui::Grid::new(table_id).striped(true).show(ui, |ui| {
                for (at, (_, row)) in rows.iter().enumerate() {
                    let row_id = table_id.with(("row", row.key()));

                    ui.ctx().accesskit_node_builder(row_id, |builder| {
                        builder.set_role(egui::accesskit::Role::Row);
                        builder.set_row_index(at);
                    });
                    ctx.with_accessibility_parent(row_id, || {
                        for (column, cell) in cells_of(row).iter().enumerate() {
                            self.cell(ui, row_id, at, column, cell, out);
                        }
                    });
                    ui.end_row();
                }
            });
        });
    }

    /// One cell of a table: its content inline (strong in a header), and its place and kind in the accessibility tree.
    fn cell(
        &mut self,
        ui: &mut Ui,
        row_id: egui::Id,
        row: usize,
        column: usize,
        cell: &Node,
        out: &mut Vec<Output>,
    ) {
        let Node::Node {
            component,
            props,
            children,
            ..
        } = cell
        else {
            return;
        };
        let cell_id = row_id.with(("cell", cell.key()));
        let role = match component.as_str() {
            "columnheader" => egui::accesskit::Role::ColumnHeader,
            "rowheader" => egui::accesskit::Role::RowHeader,
            _ => egui::accesskit::Role::Cell,
        };
        let sort = match props.get("sort").and_then(Value::as_str) {
            Some("ascending") => Some(egui::accesskit::SortDirection::Ascending),
            Some("descending") => Some(egui::accesskit::SortDirection::Descending),
            Some("other") => Some(egui::accesskit::SortDirection::Other),
            _ => None,
        };

        ui.ctx().accesskit_node_builder(cell_id, |builder| {
            builder.set_role(role);
            builder.set_row_index(row);
            builder.set_column_index(column);

            if let Some(direction) = sort {
                builder.set_sort_direction(direction);
            }
        });

        let style = Style {
            strong: component != "cell",
            ..Style::default()
        };

        let ctx = ui.ctx().clone();

        // Not wrapped: inside a grid a wrapping layout is given the column's width from before this cell was drawn, which breaks a header word in two ("Orde" "r").
        ctx.with_accessibility_parent(cell_id, || {
            keyed(ui, cell.key(), |ui| {
                ui.horizontal(|ui| self.inline_children(ui, children, out, style))
            });
        });
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
    color: Option<egui::Color32>,
}

/// A hex color of the theme as the toolkit's.
fn paint(text: &str) -> Option<egui::Color32> {
    theme::color(text).map(|[r, g, b, a]| egui::Color32::from_rgba_unmultiplied(r, g, b, a))
}

impl Style {
    fn heading(size: f32) -> Style {
        Style {
            strong: true,
            size: Some(size),
            ..Style::default()
        }
    }

    /// This style with what the theme says of the primitive laid over it: its size, its color and whether its weight is a strong one.
    fn themed(mut self, themed: &theme::Style) -> Style {
        if let Some(size) = themed.font_size {
            self.size = Some(size);
        }
        if let Some(weight) = themed.font_weight {
            self.strong = weight >= 600;
        }
        if let Some(color) = themed.text.as_deref().and_then(paint) {
            self.color = Some(color);
        }

        self
    }

    fn apply(self, mut text: RichText) -> RichText {
        if let Some(color) = self.color {
            text = text.color(color);
        }
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

/// A button drawn as the theme says: its fill, its text (already in the label), its border, its radius, its padding and its least size. What the theme does not say stays the toolkit's.
fn themed_button(
    ui: &mut Ui,
    enabled: bool,
    mut button: Button,
    themed: &theme::Style,
) -> Response {
    if let Some(fill) = themed.background.as_deref().and_then(paint) {
        button = button.fill(fill);
    }
    match &themed.border {
        Some(Border::Stroke { width, color }) => {
            if let Some(color) = paint(color) {
                button = button.stroke(egui::Stroke::new(*width, color));
            }
        }
        Some(Border::Keyword(_)) => button = button.stroke(egui::Stroke::NONE),
        None => {}
    }
    if let Some(radius) = themed.radius {
        button = button.corner_radius(radius);
    }
    if let Some(size) = themed.min_size {
        button = button.min_size(egui::vec2(size, size));
    }

    ui.scope(|ui| {
        if let Some([top, right, bottom, left]) = themed.padding {
            ui.spacing_mut().button_padding =
                egui::vec2((left + right) / 2.0, (top + bottom) / 2.0);
        }
        ui.add_enabled(enabled, button)
    })
    .inner
}

/// A text field drawn as the theme says: its fill, its text, its border (the toolkit draws it from the widget visuals, so they are set for the field only), its radius, its padding and its least size.
fn themed_field(ui: &mut Ui, mut field: TextEdit, themed: &theme::Style) -> Response {
    if let Some(fill) = themed.background.as_deref().and_then(paint) {
        field = field.background_color(fill);
    }
    if let Some(color) = themed.text.as_deref().and_then(paint) {
        field = field.text_color(color);
    }
    if let Some(size) = themed.font_size {
        field = field.font(egui::FontId::proportional(size));
    }
    if let Some([top, right, bottom, left]) = themed.padding {
        field = field.margin(egui::Margin {
            left: left.round() as i8,
            right: right.round() as i8,
            top: top.round() as i8,
            bottom: bottom.round() as i8,
        });
    }
    if let Some(size) = themed.min_size {
        field = field.min_size(egui::vec2(0.0, size));
    }

    ui.scope(|ui| {
        let stroke = match &themed.border {
            Some(Border::Stroke { width, color }) => {
                paint(color).map(|color| egui::Stroke::new(*width, color))
            }
            Some(Border::Keyword(_)) => Some(egui::Stroke::NONE),
            None => None,
        };
        let radius = themed
            .radius
            .map(|radius| egui::CornerRadius::same(radius.round().clamp(0.0, 255.0) as u8));
        let widgets = &mut ui.visuals_mut().widgets;

        for state in [
            &mut widgets.inactive,
            &mut widgets.hovered,
            &mut widgets.active,
        ] {
            if let Some(stroke) = stroke {
                state.bg_stroke = stroke;
            }
            if let Some(radius) = radius {
                state.corner_radius = radius;
            }
        }

        ui.add(field)
    })
    .inner
}

/// Runs of text sit against each other: the text carries its own spaces.
fn no_gap(ui: &mut Ui) {
    ui.spacing_mut().item_spacing.x = 0.0;
}

/// Every node that has an `id` prop, with its text.
fn gather(node: &Node, into: &mut HashMap<String, String>) {
    if let Node::Node {
        props, children, ..
    } = node
    {
        if let Some(id) = props.get("id").and_then(Value::as_str) {
            into.insert(id.to_owned(), node.text());
        }

        for child in children {
            gather(child, into);
        }
    }
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
    "toggle",
    "checkbox",
    "textfield",
    "radiogroup",
    "radio",
    "status",
    "alert",
    "label",
    "table",
    "tablehead",
    "tablebody",
    "tablerow",
    "columnheader",
    "rowheader",
    "cell",
    "dialog",
    "popover",
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

/// The spike behind decision I16: what egui remembers by id (a scroll position, whether a section is open, which text field has focus) follows a node's key when the scope is `keyed`, and
/// follows its place when it is not. egui 0.31.1 seeds the automatic ids of a child `Ui` from its parent's counter, so `push_id` keeps the child's own id but not the ids inside it.
#[cfg(test)]
mod identity_spike {
    use super::keyed;
    use egui::{CentralPanel, CollapsingHeader, Context, RawInput, ScrollArea, Ui};

    /// Runs one frame whose content is `add`.
    fn frame(ctx: &Context, add: impl FnMut(&mut Ui)) {
        let mut add = add;

        let _ = ctx.run(RawInput::default(), |ctx| {
            CentralPanel::default().show(ctx, |ui| add(ui));
        });
    }

    /// `(key, scroll offset)` of one scroll area for each key in order, in a frame; `force` is the key whose offset this frame sets.
    fn scrolls(
        ctx: &Context,
        order: &[&str],
        force: Option<&str>,
        by_key: bool,
    ) -> Vec<(String, f32)> {
        let mut seen = Vec::new();

        frame(ctx, |ui| {
            for (place, key) in order.iter().enumerate() {
                let mut show = |ui: &mut Ui| {
                    // Not keyed: what egui does by default is the same id for every area of a `Ui`, so the control names them by their place, as a list drawn by index would.
                    let mut area = ScrollArea::vertical().max_height(40.0);

                    if !by_key {
                        area = area.id_salt(place);
                    }

                    if force == Some(*key) {
                        area = area.vertical_scroll_offset(50.0);
                    }

                    let shown = area.show(ui, |ui| ui.allocate_space(egui::vec2(10.0, 200.0)));

                    seen.push((key.to_string(), shown.state.offset.y));
                };

                if by_key {
                    keyed(ui, key, show);
                } else {
                    show(ui);
                }
            }
        });

        seen
    }

    #[test]
    fn a_scroll_position_follows_the_key_and_not_the_place() {
        for (by_key, expected) in [
            (true, [("b", 50.0), ("a", 0.0)]),
            (false, [("b", 0.0), ("a", 50.0)]),
        ] {
            let ctx = Context::default();

            // Two frames: the second area is scrolled in the first, and then the two change places.
            scrolls(&ctx, &["a", "b"], Some("b"), by_key);
            scrolls(&ctx, &["a", "b"], None, by_key);

            let after = scrolls(&ctx, &["b", "a"], None, by_key);

            assert_eq!(
                after,
                expected
                    .iter()
                    .map(|(key, offset)| (key.to_string(), *offset))
                    .collect::<Vec<_>>(),
                "keyed: {by_key}"
            );
        }
    }

    /// Which keys have an open section, after the sections were laid in `order`; `open` is the key forced open in this frame.
    fn sections(
        ctx: &Context,
        order: &[&str],
        open: Option<&str>,
        by_key: bool,
    ) -> Vec<(String, bool)> {
        let mut seen = Vec::new();

        frame(ctx, |ui| {
            for (place, key) in order.iter().enumerate() {
                let mut show = |ui: &mut Ui| {
                    // The same title for both: the id must come from the key, not from what the section says (the control names them by their place).
                    let mut header = CollapsingHeader::new("section")
                        .open(open.map(|forced| forced == *key).filter(|forced| *forced));

                    if !by_key {
                        header = header.id_salt(place);
                    }

                    let shown = header.show(ui, |ui| ui.label("inside"));

                    seen.push((key.to_string(), shown.body_response.is_some()));
                };

                if by_key {
                    keyed(ui, key, show);
                } else {
                    show(ui);
                }
            }
        });

        seen
    }

    #[test]
    fn an_open_section_follows_the_key_and_not_the_place() {
        for (by_key, expected) in [
            (true, [("b", true), ("a", false)]),
            (false, [("b", false), ("a", true)]),
        ] {
            let ctx = Context::default();

            sections(&ctx, &["a", "b"], Some("b"), by_key);
            sections(&ctx, &["a", "b"], None, by_key);

            let after = sections(&ctx, &["b", "a"], None, by_key);

            assert_eq!(
                after,
                expected
                    .iter()
                    .map(|(key, open)| (key.to_string(), *open))
                    .collect::<Vec<_>>(),
                "keyed: {by_key}"
            );
        }
    }
}
