//! The theme the engine gives the window: resolved values (colors as `#rrggbb[aa]`, lengths in points), by mode and primitive, only what the window applies. It arrives once, with the first
//! `appearance` message, and is kept. The window never reads a token or a recipe: the host resolved them (the style contract, `@valancex/style`), and what the window cannot apply it was not told.
//!
//! A primitive's style is its recipe's `base`, then each of its variants (the prop the template wrote, else the variant's default), then the states it is in, then the conditions that hold (the
//! viewport class), each laid over the one before.
use serde::Deserialize;
use std::collections::BTreeMap;

/// An edge: `"none"`, or a width and a color.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum Border {
    Stroke { width: f32, color: String },
    Keyword(String),
}

/// The properties of the style contract the window applies. Every one is optional: a recipe says only what it changes.
#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Style {
    pub background: Option<String>,
    pub text: Option<String>,
    pub border: Option<Border>,
    pub radius: Option<f32>,
    /// Top, right, bottom, left.
    pub padding: Option<[f32; 4]>,
    pub gap: Option<f32>,
    pub min_size: Option<f32>,
    pub font_size: Option<f32>,
    pub font_weight: Option<u16>,
}

impl Style {
    /// `over` laid on this: what it sets replaces what this had.
    pub fn lay(&mut self, over: &Style) {
        macro_rules! take {
            ($($field:ident),*) => { $(if over.$field.is_some() { self.$field = over.$field.clone(); })* };
        }

        take!(
            background,
            text,
            border,
            radius,
            padding,
            gap,
            min_size,
            font_size,
            font_weight
        );
    }
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct Recipe {
    #[serde(default)]
    pub base: Style,
    /// Variant name, then variant value, to its style.
    #[serde(default)]
    pub variants: BTreeMap<String, BTreeMap<String, Style>>,
    #[serde(default)]
    pub states: BTreeMap<String, Style>,
    /// `viewport:compact`, `viewport:medium`, `viewport:expanded`.
    #[serde(default)]
    pub when: BTreeMap<String, Style>,
}

#[derive(Debug, Clone, Default, PartialEq, Deserialize)]
pub struct Theme {
    pub version: u64,
    pub name: String,
    /// Each variant's default value: what applies when a template does not say.
    #[serde(default)]
    pub defaults: BTreeMap<String, String>,
    /// Mode name (`light`, `dark`), then primitive name, to its recipe.
    #[serde(default)]
    pub modes: BTreeMap<String, BTreeMap<String, Recipe>>,
}

/// The class of a window's width, the same three the web's `viewport` has: under 600 points, 600 to 839, 840 and up.
pub fn viewport(width: f32) -> &'static str {
    if width >= 840.0 {
        "expanded"
    } else if width >= 600.0 {
        "medium"
    } else {
        "compact"
    }
}

impl Theme {
    /// What the window is told in `appearance`'s `theme`. A theme of a version this window does not read is refused.
    pub fn parse(value: serde_json::Value) -> Result<Theme, String> {
        let theme: Theme = serde_json::from_value(value).map_err(|error| error.to_string())?;

        if theme.version != 1 {
            return Err(format!(
                "the theme is version {}; this window reads version 1",
                theme.version
            ));
        }

        Ok(theme)
    }

    /// The style of a primitive in a mode. `variant` gives the value a template wrote for a variant, if it wrote one; `states` are the states the primitive is in; `width` is the window's.
    pub fn style(
        &self,
        mode: &str,
        primitive: &str,
        variant: &dyn Fn(&str) -> Option<String>,
        states: &[&str],
        width: f32,
    ) -> Style {
        let Some(recipe) = self
            .modes
            .get(mode)
            .and_then(|recipes| recipes.get(primitive))
        else {
            return Style::default();
        };
        let mut style = recipe.base.clone();

        for (name, values) in &recipe.variants {
            let value = variant(name).or_else(|| self.defaults.get(name).cloned());

            if let Some(found) = value.and_then(|value| values.get(&value)) {
                style.lay(found);
            }
        }

        for state in states {
            if let Some(found) = recipe.states.get(*state) {
                style.lay(found);
            }
        }

        if let Some(found) = recipe.when.get(&format!("viewport:{}", viewport(width))) {
            style.lay(found);
        }

        style
    }
}

/// `#rrggbb` or `#rrggbbaa` as red, green, blue, alpha.
pub fn color(text: &str) -> Option<[u8; 4]> {
    let hex = text.strip_prefix('#')?;

    if !(hex.len() == 6 || hex.len() == 8) || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }

    let byte = |at: usize| u8::from_str_radix(&hex[at..at + 2], 16).ok();

    Some([
        byte(0)?,
        byte(2)?,
        byte(4)?,
        if hex.len() == 8 { byte(6)? } else { 255 },
    ])
}
