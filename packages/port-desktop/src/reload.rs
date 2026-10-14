//! A development server's way to say "the engine was rebuilt": a file whose modification time changes. The window watches it (`VLX_RELOAD` names it) and starts the engine again in place, so the window
//! keeps its position and size instead of closing and opening on every save. A file, not a signal, so it works the same on every platform.
use std::path::PathBuf;
use std::time::SystemTime;

/// Watches one file for a change of modification time.
pub struct Reload {
    path: Option<PathBuf>,
    seen: Option<SystemTime>,
}

impl Reload {
    /// Watches the file the environment variable `name` gives, if it gives one.
    pub fn from_env(name: &str) -> Reload {
        Reload::of(std::env::var_os(name).map(PathBuf::from))
    }

    pub fn of(path: Option<PathBuf>) -> Reload {
        let seen = path.as_ref().and_then(modified);

        Reload { path, seen }
    }

    /// Whether there is anything to watch.
    pub fn watching(&self) -> bool {
        self.path.is_some()
    }

    /// Whether the file changed since the last time this was asked (or since it was first watched). A file that is not there yet is not a change.
    pub fn changed(&mut self) -> bool {
        let Some(path) = &self.path else { return false };
        let now = modified(path);

        if now.is_some() && now != self.seen {
            self.seen = now;

            return true;
        }

        false
    }
}

fn modified(path: &PathBuf) -> Option<SystemTime> {
    std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
}
