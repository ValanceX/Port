//! The window: a generic runner that starts an engine, draws what it sends and reports what the person does, until the application ends. An application's own binary is a call to `run`.
use crate::host::{Applied, Engine, Session, ToEngine, PROTOCOL};
use crate::reload::Reload;
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
    /// The file a development server touches when it rebuilds the engine (`VLX_RELOAD`).
    reload: Reload,
    /// The system's colors as last told to the engine.
    told_scheme: Option<egui::Theme>,
    /// The width of the window's content as last told to the engine, in whole points.
    told_width: Option<u32>,
    engine: Engine,
    session: Session,
    view: View,
    title: String,
    problem: Option<String>,
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        // The engine was rebuilt: start it again in this window, from its first screen.
        if self.reload.watching() {
            ctx.request_repaint_after(std::time::Duration::from_millis(250));

            if self.reload.changed() {
                match self.engine.restart() {
                    Ok(()) => {
                        self.session = Session::default();
                        self.view.reset();
                        self.problem = None;
                        self.told_scheme = None;
                        self.told_width = None;
                    }
                    Err(error) => {
                        self.problem = Some(format!("could not restart the engine: {error}"))
                    }
                }
            }
        }

        while let Ok(message) = self.engine.messages.try_recv() {
            let replaced = matches!(message, crate::host::FromEngine::Draw { .. });

            let applied = self.session.apply(message);

            // A theme the window cannot read is not the window's to mend: it keeps its own look, and says so where the person who wrote the theme looks.
            if let Some(problem) = self.session.theme_problem.take() {
                eprintln!("the theme could not be read: {problem}");
            }

            match applied {
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

        // How the application asks the window to look; the window follows the system when it asks for nothing.
        let preference = match self.session.appearance.as_deref() {
            Some("light") => egui::ThemePreference::Light,
            Some("dark") => egui::ThemePreference::Dark,
            _ => egui::ThemePreference::System,
        };

        if ctx.options(|options| options.theme_preference) != preference {
            ctx.set_theme(preference);
        }

        // The system's colors, told to the engine when the window learns them and when they change.
        let system = ctx.system_theme();

        if system.is_some() && system != self.told_scheme {
            self.told_scheme = system;
            self.engine.send(&ToEngine::Scheme {
                scheme: match system {
                    Some(egui::Theme::Dark) => "dark",
                    _ => "light",
                }
                .into(),
            });
        }

        // How much room there is, told to the engine when the window learns it and when it changes by a point.
        let width = ctx.screen_rect().width().round().max(0.0) as u32;

        if width > 0 && Some(width) != self.told_width {
            self.told_width = Some(width);
            self.engine.send(&ToEngine::Resize { width });
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
                    self.view.set_theme(self.session.theme.clone());
                    self.view.show(ui, &tree.root, &mut reports);
                } else {
                    ui.label("Starting…");
                }
            });
        });

        if closing {
            self.engine.send(&ToEngine::CloseRequested);
        }
        if let Some(direction) =
            ctx.input(|input| crate::keys::navigation(input, cfg!(target_os = "macos")))
        {
            self.engine.send(&ToEngine::Navigate {
                direction: direction.word().into(),
            });
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
            egui_extras::install_image_loaders(&cc.egui_ctx);

            Ok(Box::new(App {
                reload: Reload::from_env("VLX_RELOAD"),
                told_scheme: None,
                told_width: None,
                engine,
                session: Session::default(),
                view: View::default(),
                title,
                problem: None,
            }))
        }),
    )
}
