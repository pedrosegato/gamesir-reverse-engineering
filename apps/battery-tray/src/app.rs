use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use tao::event::{Event, StartCause};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder};

use crate::icon::{ICON_SIZE, circle_rgba};
use crate::indicator::{Rgb, indicator};
use crate::worker::{Command, Update, Worker};
use crate::{autostart, single_instance};

const SLOT: usize = 3;
const IDLE: Rgb = [128, 128, 128];
const QUIT_GRACE: Duration = Duration::from_secs(5);

enum AppEvent {
    Worker(Update),
    Menu(MenuEvent),
}

struct Tray {
    icon: TrayIcon,
    status: MenuItem,
    color: Rgb,
}

impl Tray {
    fn show(&mut self, update: Update, paused: bool) {
        let (text, color) = describe(update);
        let text = if paused { format!("Cyclone 2: {text} · pausado") } else { format!("Cyclone 2: {text}") };
        let _ = self.icon.set_tooltip(Some(&text));
        self.status.set_text(&text);
        if color != self.color {
            let _ = self.icon.set_icon(Some(icon(color)));
            self.color = color;
        }
    }
}

fn describe(update: Update) -> (String, Rgb) {
    match update {
        Update::Searching | Update::Stopped => ("procurando o controle…".to_owned(), IDLE),
        Update::Connected(connection) => (format!("conectado pelo {}", connection.label()), IDLE),
        Update::NoSignal(connection) => (format!("sem sinal ({})", connection.label()), IDLE),
        Update::Battery(status, connection) => {
            let shown = indicator(status.key());
            (format!("{}% · {} ({})", status.percent(), shown.label, connection.label()), shown.icon)
        }
    }
}

fn icon(color: Rgb) -> Icon {
    Icon::from_rgba(circle_rgba(color), ICON_SIZE, ICON_SIZE).expect("ícone RGBA 32×32")
}

pub fn run() {
    if !single_instance::acquire() {
        return;
    }

    let event_loop = EventLoopBuilder::<AppEvent>::with_user_event().build();

    let menu_proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = menu_proxy.send_event(AppEvent::Menu(event));
    }));

    let (commands, receiver) = mpsc::channel();
    let worker_proxy = event_loop.create_proxy();
    thread::spawn(move || {
        let notify = move |update| {
            let _ = worker_proxy.send_event(AppEvent::Worker(update));
        };
        Worker::new(receiver, notify, SLOT).run();
    });

    let status_item = MenuItem::new("Cyclone 2: procurando o controle…", false, None);
    let pause_item = MenuItem::new("Pausar", true, None);
    let autostart_item = CheckMenuItem::new("Iniciar com o Windows", true, autostart::is_enabled(), None);
    let quit_item = MenuItem::new("Sair", true, None);
    let menu = Menu::new();
    menu.append_items(&[
        &status_item,
        &PredefinedMenuItem::separator(),
        &pause_item,
        &autostart_item,
        &PredefinedMenuItem::separator(),
        &quit_item,
    ])
    .expect("menu da bandeja");

    let mut tray: Option<Tray> = None;
    let mut last = Update::Searching;
    let mut paused = false;

    event_loop.run(move |event, _, control_flow| match event {
        Event::NewEvents(StartCause::Init) => {
            *control_flow = ControlFlow::Wait;
            tray = TrayIconBuilder::new()
                .with_menu(Box::new(menu.clone()))
                .with_tooltip("Cyclone 2")
                .with_icon(icon(IDLE))
                .build()
                .ok()
                .map(|icon| Tray { icon, status: status_item.clone(), color: IDLE });
        }
        Event::NewEvents(StartCause::ResumeTimeReached { .. })
        | Event::UserEvent(AppEvent::Worker(Update::Stopped)) => {
            tray.take();
            *control_flow = ControlFlow::Exit;
        }
        Event::UserEvent(AppEvent::Worker(update)) => {
            last = update;
            if let Some(tray) = tray.as_mut() {
                tray.show(last, paused);
            }
        }
        Event::UserEvent(AppEvent::Menu(event)) => {
            if event.id == *quit_item.id() {
                let _ = commands.send(Command::Quit);
                *control_flow = ControlFlow::WaitUntil(Instant::now() + QUIT_GRACE);
            } else if event.id == *pause_item.id() {
                paused = !paused;
                pause_item.set_text(if paused { "Retomar" } else { "Pausar" });
                let _ = commands.send(if paused { Command::Pause } else { Command::Resume });
                if let Some(tray) = tray.as_mut() {
                    tray.show(last, paused);
                }
            } else if event.id == *autostart_item.id() {
                let wanted = autostart_item.is_checked();
                if autostart::set(wanted).is_err() {
                    autostart_item.set_checked(!wanted);
                }
            }
        }
        _ => {}
    });
}
