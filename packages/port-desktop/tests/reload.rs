//! A development server rebuilds the engine and touches a file; the window starts the engine again in place. `Reload` is the watching, `Engine::restart` the starting again.
use port_desktop::host::{Engine, FromEngine};
use port_desktop::reload::Reload;
use std::time::{Duration, SystemTime};

#[test]
fn a_file_changing_is_a_reload_and_nothing_else_is() {
    let dir = std::env::temp_dir().join(format!("vlx-reload-{}", std::process::id()));

    std::fs::create_dir_all(&dir).unwrap();

    let file = dir.join("reload");
    let mut reload = Reload::of(Some(file.clone()));

    assert!(reload.watching());
    assert!(
        !reload.changed(),
        "a file that is not there is not a change"
    );

    std::fs::write(&file, "1").unwrap();
    assert!(reload.changed(), "it appeared");
    assert!(!reload.changed(), "asking again is not another change");

    let later = SystemTime::now() + Duration::from_secs(5);

    std::fs::File::options()
        .write(true)
        .open(&file)
        .unwrap()
        .set_modified(later)
        .unwrap();
    assert!(reload.changed(), "its modification time moved");
    assert!(!Reload::of(None).watching());
    assert!(!Reload::of(None).changed());
}

#[cfg(unix)]
#[test]
fn restarting_the_engine_starts_the_same_command_again() {
    // an engine that says hello with a counter of how many times it has been started, then waits
    let dir = std::env::temp_dir().join(format!("vlx-engine-{}", std::process::id()));

    std::fs::create_dir_all(&dir).unwrap();

    let counter = dir.join("starts");
    let script = format!(
        "echo x >> {c}; n=$(wc -l < {c} | tr -d ' '); echo \"{{\\\"op\\\":\\\"hello\\\",\\\"protocol\\\":1,\\\"app\\\":\\\"start-$n\\\"}}\"; cat",
        c = counter.display()
    );
    let mut engine = Engine::spawn("sh", &["-c".into(), script], || {}).unwrap();
    let hello = |engine: &Engine| match engine.messages.recv_timeout(Duration::from_secs(5)) {
        Ok(FromEngine::Hello { app, .. }) => app,
        other => panic!("not a hello: {other:?}"),
    };

    assert_eq!(hello(&engine), "start-1");
    engine.restart().unwrap();
    assert_eq!(hello(&engine), "start-2");
    engine.close();
}
