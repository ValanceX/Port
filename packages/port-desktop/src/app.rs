//! The window: a generic runner that starts an engine, draws what it sends and reports what the person does, until the application ends. An application's own binary is a call to `run`.
use crate::host::{Applied, Engine, Session, ToEngine, PROTOCOL};
use crate::view::{Output, View};
use std::sync::{Arc, OnceLock};

/// What an application tells the runner.
pub struct Options {
    /// The window's title until the engine's first screen names one.
    pub title: String,
    /// The environment variable that names the engine's command line for development (`node dist/main.js`).
    pub engine_env: String,
    /// The engine executable's name next to this program, for a packaged app (`todo-engine`; `.exe` is added on Windows).
    pub engine_sibling: String,
    /// The window's first size in points.
    pub size: [f32; 2],
}

fn engine_command(options: &Options) -> (String, Vec<String>) {
    if let Ok(line) = std::env::var(&options.engine_env) {
        let mut parts = line.split_whitespace().map(str::to_owned);

        if let Some(program) = parts.next() {
            return (program, parts.collect());
        }
    }

    let name = if cfg!(windows) {
        format!("{}.exe", options.engine_sibling)
    } else {
        options.engine_sibling.clone()
    };
    let sibling = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(&name)))
        .unwrap_or_else(|| name.clone().into());

    (sibling.to_string_lossy().into_owned(), Vec::new())
}

struct App {
    engine: Engine,
    session: Session,
    view: View,
    title: String,
    problem: Option<String>,
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(message) = self.engine.messages.try_recv() {
            let replaced = matches!(message, crate::host::FromEngine::Draw { .. });

            match self.session.apply(message) {
                Applied::Changed => {
                    if replaced {
                        self.view.reset();
                    }
                }
                Applied::Closed => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
                Applied::Incompatible(found) => {
                    self.problem = Some(format!(
                        "The engine speaks protocol {found}; this app speaks {PROTOCOL}."
                    ))
                }
                Applied::Refused(error) => self.problem = Some(error.to_string()),
            }
        }

        if let Some(title) = self.session.title.clone() {
            if title != self.title {
                ctx.send_viewport_cmd(egui::ViewportCommand::Title(title.clone()));
                self.title = title;
            }
        }

        let mut reports = Vec::new();
        let mut closing = false;

        // Closing the window is the application's to allow: unsaved edits can say no. The window stays until the engine's answer; an allowed answer ends the engine, which unmounts the screen.
        if ctx.input(|input| input.viewport().close_requested()) && !self.session.gone {
            ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
            closing = true;
        }

        egui::CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                if self.session.close_refused {
                    ui.colored_label(
                        egui::Color32::LIGHT_RED,
                        "There are unsaved changes. Save or discard them to close.",
                    );
                }
                if let Some(problem) = &self.problem {
                    ui.colored_label(egui::Color32::LIGHT_RED, problem);
                } else if let Some(tree) = self.session.port.tree() {
                    self.view.show(ui, &tree.root, &mut reports);
                } else {
                    ui.label("Starting…");
                }
            });
        });

        if closing {
            self.engine.send(&ToEngine::CloseRequested);
        }
        for output in reports {
            match output {
                Output::Report(report) => self.engine.send(&report.into()),
                Output::Link(href) => self.engine.send(&ToEngine::Link { href }),
            }
        }
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        self.engine.close();
    }
}

/// Opens the window and runs until the application ends.
pub fn run(options: Options) -> eframe::Result {
    let (program, args) = engine_command(&options);
    // The engine's thread asks the window to repaint when a message arrives; the window exists only after the engine starts, so it hands its context over once it does.
    let window: Arc<OnceLock<egui::Context>> = Arc::new(OnceLock::new());
    let engine = match Engine::spawn(&program, &args, {
        let window = window.clone();

        move || {
            if let Some(ctx) = window.get() {
                ctx.request_repaint();
            }
        }
    }) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("could not start the engine ({program}): {error}");
            std::process::exit(2);
        }
    };
    let title = options.title.clone();

    eframe::run_native(
        &options.title,
        eframe::NativeOptions {
            viewport: egui::ViewportBuilder::default()
                .with_inner_size(options.size)
                .with_title(&options.title),
            ..Default::default()
        },
        Box::new(move |cc| {
            let _ = window.set(cc.egui_ctx.clone());

            Ok(Box::new(App {
                engine,
                session: Session::default(),
                view: View::default(),
                title,
                problem: None,
            }))
        }),
    )
}
