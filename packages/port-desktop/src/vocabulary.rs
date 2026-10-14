//! The desktop vocabulary: the components a template may write for this PORT, as data. The same file (`vocabulary.json`, in MESH's manifest format) is what tools read to check a template, so the
//! PORT and the build cannot disagree about what exists.
use serde_json::Value;

/// `vocabulary.json`, verbatim.
pub const JSON: &str = include_str!("../vocabulary.json");

/// `content.json`, verbatim: the **content layer**, what Markdown produces (a paragraph, a list, code, a quotation, an image, emphasis, a link), named as WAI-ARIA names the same things. Experimental:
/// it is drawn and tested, and not yet part of what this PORT promises.
pub const CONTENT_JSON: &str = include_str!("../content.json");

fn names(json: &str) -> Vec<String> {
    let parsed: Value = serde_json::from_str(json).expect("the vocabulary is JSON");

    parsed["components"]
        .as_object()
        .map(|each| each.keys().cloned().collect())
        .unwrap_or_default()
}

/// The names of the controls-and-layout components (`vocabulary.json`).
pub fn components() -> Vec<String> {
    names(JSON)
}

/// The names of the content-layer components (`content.json`).
pub fn content_components() -> Vec<String> {
    names(CONTENT_JSON)
}
