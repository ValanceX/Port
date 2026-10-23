//! The host protocol's messages about the window itself, which are the application's word (its title, its appearance) and the system's (its colors). Both directions, as lines of JSON.
use port_desktop::host::{parse, FromEngine, Session, ToEngine};

#[test]
fn the_engine_asks_for_an_appearance_and_the_session_keeps_it() {
    let message = parse(r#"{"op":"appearance","appearance":"dark"}"#).expect("a message");

    assert_eq!(
        message,
        FromEngine::Appearance {
            appearance: "dark".into(),
            theme: None
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

#[test]
fn the_window_tells_the_engine_which_way_the_person_asked_to_move_along_the_pages() {
    for (direction, line) in [
        ("back", r#"{"op":"navigate","direction":"back"}"#),
        ("forward", r#"{"op":"navigate","direction":"forward"}"#),
    ] {
        let sent = serde_json::to_string(&ToEngine::Navigate {
            direction: direction.into(),
        })
        .unwrap();

        assert_eq!(sent, line);
    }
}

#[test]
fn the_window_tells_the_engine_how_wide_it_is() {
    let line = serde_json::to_string(&ToEngine::Resize { width: 812 }).unwrap();

    assert_eq!(line, r#"{"op":"resize","width":812}"#);
}

#[test]
fn the_engine_asks_for_focus_by_key_and_the_port_keeps_the_request_for_the_window() {
    let message = parse(r#"{"op":"focus","key":"kAAAAAAAAAAAAAAAAAAAAA2"}"#).expect("a message");

    assert_eq!(
        message,
        FromEngine::Focus {
            key: "kAAAAAAAAAAAAAAAAAAAAA2".into()
        }
    );

    let mut session = Session::default();
    let tree = parse(
        r#"{"op":"draw","tree":{"format":"mesh-render","version":1,"root":{"type":"node","key":"kAAAAAAAAAAAAAAAAAAAAA1","component":"column","props":{},"events":{},"children":[{"type":"node","key":"kAAAAAAAAAAAAAAAAAAAAA2","component":"button","props":{},"events":{},"children":[]}]}}}"#,
    )
    .expect("a message");

    // before anything is drawn there is nothing to focus: the request is not kept
    session.apply(message.clone());
    assert_eq!(session.port.take_focus_request(), None);

    session.apply(tree);
    session.apply(message);
    assert_eq!(
        session.port.take_focus_request().as_deref(),
        Some("kAAAAAAAAAAAAAAAAAAAAA2")
    );
    assert_eq!(session.port.take_focus_request(), None, "taken once");

    // a key that is not drawn is not a request
    assert!(!session.port.focus("nobody"));
    assert_eq!(session.port.take_focus_request(), None);
}
