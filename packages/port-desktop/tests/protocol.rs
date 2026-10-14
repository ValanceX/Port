//! The host protocol's messages about the window itself, which are the application's word (its title, its appearance) and the system's (its colors). Both directions, as lines of JSON.
use port_desktop::host::{parse, FromEngine, Session, ToEngine};

#[test]
fn the_engine_asks_for_an_appearance_and_the_session_keeps_it() {
    let message = parse(r#"{"op":"appearance","appearance":"dark"}"#).expect("a message");

    assert_eq!(
        message,
        FromEngine::Appearance {
            appearance: "dark".into()
        }
    );

    let mut session = Session::default();

    session.apply(message);
    assert_eq!(session.appearance.as_deref(), Some("dark"));
}

#[test]
fn the_window_tells_the_engine_the_systems_colors() {
    let line = serde_json::to_string(&ToEngine::Scheme {
        scheme: "dark".into(),
    })
    .unwrap();

    assert_eq!(line, r#"{"op":"scheme","scheme":"dark"}"#);
}
