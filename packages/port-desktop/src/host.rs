//! The host protocol: how a composer in another process (an engine running the application) drives this PORT. One JSON object per line, in both directions. It carries the PORT's operations out
//! and the PORT's reports back, and nothing else: the PORT never sees a command, a state or a route. The protocol is specified in `docs/architecture/2026-10-14-port-desktop.md`.
use crate::port::{Port, PortError, Report};
use crate::theme::Theme;
use crate::tree::Tree;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::sync::Arc;
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
    /// How the application asks the window to look: `light`, `dark` or `system` (the person's own). The window is the host's, so this is the application's word, not a template's.
    Appearance {
        appearance: String,
        /// The look the host gives the window (the theme, resolved): sent once, with the first `appearance`, and kept. Absent: the window keeps its own look.
        #[serde(default)]
        theme: Option<Value>,
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
    /// The person activated a link. A link is an address, not an event: the tree carries its `href` and no handler, so the PORT tells the engine which address and the engine decides what it means
    /// (the application owns navigation). The PORT never opens an address itself.
    Link {
        href: String,
    },
    /// The system's colors, as the window sees them: sent when the window opens and whenever they change. The application learns them as state.
    Scheme {
        scheme: String,
    },
    /// The person asked to move along the pages they visited (`"back"` or `"forward"`): Alt+Left and Alt+Right, or the mouse's back and forward buttons. The engine owns the list of pages and
    /// may refuse; the window only says what was asked. Never sent for a key the platform has no convention for.
    Navigate {
        direction: String,
    },
    /// How wide the window's content is, in points (logical pixels): sent when the window opens and whenever the width changes by a whole point. The application learns how much room it has
    /// (`viewport`) from it, as the web learns it from the page's width.
    Resize {
        width: u32,
    },
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
    /// How the engine asked the window to look (`light`, `dark`, `system`), as it last said it.
    pub appearance: Option<String>,
    /// The theme the engine gave the window, as it last gave it.
    pub theme: Option<Arc<Theme>>,
    /// Why the theme the engine gave could not be read, if it could not: the window keeps its own look and says so on the error stream.
    pub theme_problem: Option<String>,
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
            FromEngine::Appearance { appearance, theme } => {
                self.appearance = Some(appearance);

                if let Some(given) = theme {
                    match Theme::parse(given) {
                        Ok(read) => {
                            self.theme = Some(Arc::new(read));
                            self.theme_problem = None;
                        }
                        Err(problem) => self.theme_problem = Some(problem),
                    }
                }
            }
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
    program: String,
    args: Vec<String>,
    wake: Arc<dyn Fn() + Send + Sync>,
    child: Child,
    stdin: Option<ChildStdin>,
    pub messages: Receiver<FromEngine>,
}

impl Engine {
    /// Starts `program args…`. `wake` is called after each message arrives (a window asks for a repaint).
    pub fn spawn(
        program: &str,
        args: &[String],
        wake: impl Fn() + Send + Sync + 'static,
    ) -> std::io::Result<Engine> {
        Engine::start(program.to_owned(), args.to_vec(), Arc::new(wake))
    }

    fn start(
        program: String,
        args: Vec<String>,
        wake: Arc<dyn Fn() + Send + Sync>,
    ) -> std::io::Result<Engine> {
        let mut command = Command::new(&program);

        command
            .args(&args)
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
        let woken = wake.clone();

        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };

                match parse(&line) {
                    Ok(message) => {
                        if send.send(message).is_err() {
                            break;
                        }
                        woken();
                    }
                    Err(error) => {
                        eprintln!("port-desktop: ignoring a line that is not a message: {error}")
                    }
                }
            }
        });

        Ok(Engine {
            program,
            args,
            wake,
            child,
            stdin,
            messages,
        })
    }

    /// Ends this engine and starts the same command again: the window stays, and the application starts from its first screen. What a development server does after a rebuild.
    pub fn restart(&mut self) -> std::io::Result<()> {
        self.stdin = None;
        let _ = self.child.kill();
        let _ = self.child.wait();

        *self = Engine::start(self.program.clone(), self.args.clone(), self.wake.clone())?;

        Ok(())
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
