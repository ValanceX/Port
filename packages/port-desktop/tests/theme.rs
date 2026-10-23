//! The theme the engine gives the window: how it is read from the `appearance` message, kept, and resolved to a primitive's style. The fixture is what `@valancex/style`'s `resolveForDesktop` writes for
//! the default theme (regenerate it from the Valance repository when the contract changes); reading it here is the wire contract between the two.
use port_desktop::host::{parse, Session};
use port_desktop::theme::{color, viewport, Border, Theme};
use serde_json::Value;

fn fixture() -> Value {
    serde_json::from_str(include_str!("fixtures/theme-default.json")).expect("the fixture is JSON")
}

fn theme() -> Theme {
    Theme::parse(fixture()).expect("the fixture is a theme this window reads")
}

fn none(_: &str) -> Option<String> {
    None
}

#[test]
fn reads_the_default_theme_the_style_contract_writes() {
    let theme = theme();

    assert_eq!(theme.name, "default");
    assert_eq!(theme.modes.keys().collect::<Vec<_>>(), ["dark", "light"]);
    assert_eq!(
        theme.defaults.get("intent").map(String::as_str),
        Some("neutral")
    );
    // all seven primitives of the portable core have a recipe in each mode
    for mode in ["light", "dark"] {
        let mut names: Vec<_> = theme.modes[mode].keys().cloned().collect();

        names.sort();
        assert_eq!(
            names,
            [
                "button",
                "checkbox",
                "column",
                "heading",
                "row",
                "text",
                "textfield"
            ]
        );
    }
}

#[test]
fn a_primitives_style_is_its_base_then_its_variants_then_its_states_then_the_viewport() {
    let theme = theme();
    let neutral = theme.style("light", "button", &none, &[], 1000.0);

    // the default intent applies when the template says none; the default size's padding is the base's
    assert_eq!(neutral.background.as_deref(), Some("#ffffff"));
    assert_eq!(neutral.radius, Some(8.0));
    assert_eq!(neutral.padding, Some([8.0, 16.0, 8.0, 16.0]));

    let primary = theme.style(
        "light",
        "button",
        &|name| (name == "intent").then(|| "primary".to_owned()),
        &[],
        1000.0,
    );

    assert_eq!(primary.background.as_deref(), Some("#4a2fc0"));
    assert_eq!(primary.text.as_deref(), Some("#ffffff"));
    assert_eq!(
        primary.border,
        Some(Border::Stroke {
            width: 1.0,
            color: "#4a2fc0".into()
        })
    );

    let large = theme.style(
        "light",
        "button",
        &|name| (name == "size").then(|| "lg".to_owned()),
        &[],
        1000.0,
    );

    assert_eq!(large.padding, Some([12.0, 32.0, 12.0, 32.0]));

    // the compact viewport asks for the touch-sized target
    assert_eq!(
        theme.style("light", "button", &none, &[], 500.0).min_size,
        Some(48.0)
    );
    assert_eq!(
        theme.style("light", "button", &none, &[], 1000.0).min_size,
        Some(40.0)
    );

    // a state the window applies
    let invalid = theme.style("light", "textfield", &none, &["invalid"], 1000.0);

    assert_eq!(
        invalid.border,
        Some(Border::Stroke {
            width: 2.0,
            color: "#b3261e".into()
        })
    );
}

#[test]
fn the_dark_mode_has_its_own_colors() {
    let theme = theme();

    assert_eq!(
        theme
            .style("dark", "text", &none, &[], 1000.0)
            .text
            .as_deref(),
        Some("#e8eaf1")
    );
    assert_eq!(
        theme
            .style("light", "text", &none, &[], 1000.0)
            .text
            .as_deref(),
        Some("#1d2330")
    );
}

#[test]
fn a_primitive_with_no_recipe_has_no_style() {
    assert_eq!(
        theme().style("light", "radiogroup", &none, &[], 1000.0),
        Default::default()
    );
    assert_eq!(
        theme().style("sepia", "button", &none, &[], 1000.0),
        Default::default()
    );
}

#[test]
fn the_viewport_classes_are_the_webs() {
    assert_eq!(
        [
            viewport(599.0),
            viewport(600.0),
            viewport(839.0),
            viewport(840.0)
        ],
        ["compact", "medium", "medium", "expanded"]
    );
}

#[test]
fn colors_are_hex_with_an_optional_alpha() {
    assert_eq!(color("#4a2fc0"), Some([0x4a, 0x2f, 0xc0, 255]));
    assert_eq!(color("#4a2fc080"), Some([0x4a, 0x2f, 0xc0, 0x80]));
    assert_eq!(color("4a2fc0"), None);
    assert_eq!(color("#4a2fc"), None);
    assert_eq!(color("#4a2fcg"), None);
}

#[test]
fn a_theme_of_another_version_or_shape_is_refused() {
    let mut other = fixture();

    other["version"] = Value::from(2);
    assert!(Theme::parse(other).unwrap_err().contains("version 2"));
    assert!(
        Theme::parse(serde_json::json!({"version": 1})).is_err(),
        "a theme has a name"
    );
    assert!(Theme::parse(serde_json::json!({"version": 1, "name": "x", "modes": {"light": {"button": {"base": {"radius": "round"}}}}})).is_err());
}

#[test]
fn the_session_keeps_the_theme_it_was_given_with_the_appearance_and_not_a_bad_one() {
    let line = format!(
        r#"{{"op":"appearance","appearance":"system","theme":{}}}"#,
        fixture()
    );
    let mut session = Session::default();

    session.apply(parse(&line).expect("a message"));
    assert_eq!(
        session.theme.as_ref().map(|theme| theme.name.as_str()),
        Some("default")
    );

    // a later appearance without a theme leaves it; a theme that cannot be read leaves the one it has and says why
    session.apply(parse(r#"{"op":"appearance","appearance":"dark"}"#).expect("a message"));
    assert!(session.theme.is_some());
    assert_eq!(session.theme_problem, None);
    session.apply(
        parse(r#"{"op":"appearance","appearance":"dark","theme":{"version":9,"name":"x"}}"#)
            .expect("a message"),
    );
    assert!(session.theme.is_some());
    assert!(session
        .theme_problem
        .as_deref()
        .is_some_and(|problem| problem.contains("version 9")));
}
