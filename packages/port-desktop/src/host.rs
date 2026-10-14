//! The host protocol: how a composer in another process (an engine running the application) drives this PORT. One JSON object per line, in both directions. It carries the PORT's operations out
//! and the PORT's reports back, and nothing else: the PORT never sees a command, a state or a route. The protocol is specified in `docs/architecture/2026-10-14-port-desktop.md`.
use crate::port::{Port, PortError, Report};
use crate::tree::Tree;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

pub const PROTOCOL: u64 = 1;

/// What the engine sends.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum FromEngine {
    Hello {
        protocol: u64,
        app: String,
    },
    Draw {
        tree: Tree,
    },
    Update {
        tree: Tree,
    },
    Unmount,
    /// What the window is called. The window is the host's, not the template's: the application says its title.
    Title {
        title: String,
    },
    /// The answer to `CloseRequested`: when not allowed (unsaved edits), the window stays open.
    #[serde(rename = "closeAnswer")]
    CloseAnswer {
        allowed: bool,
    },
}

/// What this PORT sends.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum ToEngine {
    Event {
        handler: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        payload: Option<Value>,
    },
    Close,
    /// The person asked to close the window; the engine answers with `closeAnswer`.
    #[serde(rename = "closeRequested")]
    CloseRequested,
}

impl From<Report> for ToEngine {
    fn from(report: Report) -> ToEngine {
        ToEngine::Event {
            handler: report.handler,
            payload: report.payload,
        }
    }
}

pub fn parse(line: &str) -> Result<FromEngine, serde_json::Error> {
    serde_json::from_str(line)
}

/// What applying one message did.
#[derive(Debug, PartialEq)]
pub enum Applied {
    Changed,
    /// The screen is gone: the window should close.
    Closed,
    /// The engine speaks a protocol this PORT does not.
    Incompatible(u64),
    /// The PORT refused the operation (a tree it cannot read).
    Refused(PortError),
}

/// The window's view of the conversation: what is drawn, and what the engine last said about closing.
#[derive(Debug, Default)]
pub struct Session {
    pub port: Port,
    pub app: Option<String>,
    pub gone: bool,
    /// The window's title, as the engine last said it.
    pub title: Option<String>,
    /// The engine said the window may not close yet (unsaved edits); cleared by the next screen it sends.
    pub close_refused: bool,
}

impl Session {
    pub fn apply(&mut self, message: FromEngine) -> Applied {
        match message {
            FromEngine::Hello { protocol, app } => {
                if protocol != PROTOCOL {
                    return Applied::Incompatible(protocol);
                }
                self.app = Some(app);
            }
            FromEngine::Draw { tree } => match self.port.draw(tree) {
                Ok(()) => self.close_refused = false,
                Err(error) => return Applied::Refused(error),
            },
            FromEngine::Update { tree } => match self.port.update(tree) {
                Ok(()) => self.close_refused = false,
                Err(error) => return Applied::Refused(error),
            },
            FromEngine::Title { title } => self.title = Some(title),
            FromEngine::CloseAnswer { allowed } => self.close_refused = !allowed,
            FromEngine::Unmount => {
                self.port.unmount();
                self.gone = true;
                return Applied::Closed;
            }
        }
        Applied::Changed
    }
}

/// The engine as a child process: its stdout is read on a thread, its stdin written to.
pub struct Engine {
    child: Child,
    stdin: Option<ChildStdin>,
    pub messages: Receiver<FromEngine>,
}

impl Engine {
    /// Starts `program args…`. `wake` is called after each message arrives (a window asks for a repaint).
    pub fn spawn(
        program: &str,
        args: &[String],
        wake: impl Fn() + Send + 'static,
    ) -> std::io::Result<Engine> {
        let mut command = Command::new(program);

        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: the engine has no console of its own
        }

        let mut child = command.spawn()?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("piped");
        let (send, messages) = channel();

        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };

                match parse(&line) {
                    Ok(message) => {
                        if send.send(message).is_err() {
                            break;
                        }
                        wake();
                    }
                    Err(error) => {
                        eprintln!("port-desktop: ignoring a line that is not a message: {error}")
                    }
                }
            }
        });

        Ok(Engine {
            child,
            stdin,
            messages,
        })
    }

    pub fn send(&mut self, message: &ToEngine) {
        if let Some(stdin) = self.stdin.as_mut() {
            let line = serde_json::to_string(message).expect("a message serializes");

            if writeln!(stdin, "{line}")
                .and_then(|_| stdin.flush())
                .is_err()
            {
                self.stdin = None; // the engine is gone
            }
        }
    }

    /// Tells the engine the window is closing, then waits for it.
    pub fn close(&mut self) {
        self.send(&ToEngine::Close);
        self.stdin = None;
        let _ = self.child.wait();
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stdin = None;
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
