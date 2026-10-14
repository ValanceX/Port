//! The desktop vocabulary: the components a template may write for this PORT, as data. The same file (`vocabulary.json`, in MESH's manifest format) is what tools read to check a template, so the
//! PORT and the build cannot disagree about what exists.
use serde_json::Value;

/// `vocabulary.json`, verbatim.
pub const JSON: &str = include_str!("../vocabulary.json");

/// The names of the components, in the order the file declares them.
pub fn components() -> Vec<String> {
    let parsed: Value = serde_json::from_str(JSON).expect("vocabulary.json is JSON");

    parsed["components"]
        .as_object()
        .map(|each| each.keys().cloned().collect())
        .unwrap_or_default()
}
