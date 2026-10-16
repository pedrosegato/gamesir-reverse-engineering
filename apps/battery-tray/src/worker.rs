use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::time::{Duration, Instant};

use hidapi::HidApi;

use crate::battery::{IndicatorKey, Status, classify};
use crate::controller::{Controller, Error, SavedSlot};
use crate::indicator::indicator;
use crate::protocol::Connection;

/// Fora da amostragem o heartbeat para e o controle deixa de transmitir estado, poupando a bateria dele.
const SAMPLE_EVERY: Duration = Duration::from_secs(5);
const SAMPLE_TIMEOUT: Duration = Duration::from_millis(1500);
const SEARCH_EVERY: Duration = Duration::from_secs(3);

pub enum Command {
    Pause,
    Resume,
    Quit,
}

#[derive(Clone, Copy, Debug)]
pub enum Update {
    Searching,
    Connected(Connection),
    Battery(Status, Connection),
    NoSignal(Connection),
    Stopped,
}

pub struct Worker<F: Fn(Update)> {
    commands: Receiver<Command>,
    notify: F,
    slot: usize,
    paused: bool,
    saved: Option<SavedSlot>,
}

impl<F: Fn(Update)> Worker<F> {
    pub fn new(commands: Receiver<Command>, notify: F, slot: usize) -> Self {
        Self { commands, notify, slot, paused: false, saved: None }
    }

    pub fn run(mut self) {
        if let Ok(mut api) = HidApi::new() {
            while let Some((mut pad, connection)) = self.search(&mut api) {
                if self.session(&mut pad, connection).is_ok() {
                    break;
                }
            }
        }
        (self.notify)(Update::Stopped);
    }

    fn search(&mut self, api: &mut HidApi) -> Option<(Controller, Connection)> {
        let mut announced = false;
        loop {
            if let Some(found) = Controller::find(api) {
                return Some(found);
            }
            if !announced {
                (self.notify)(Update::Searching);
                announced = true;
            }
            let deadline = Instant::now() + SEARCH_EVERY;
            while let Some(left) = deadline.checked_duration_since(Instant::now()) {
                match self.next_command(left) {
                    None => break,
                    Some(Command::Quit) => return None,
                    Some(Command::Pause) => self.paused = true,
                    Some(Command::Resume) => self.paused = false,
                }
            }
        }
    }

    /// Só retorna `Ok` quando o usuário pede para sair; erro significa conexão perdida.
    fn session(&mut self, pad: &mut Controller, connection: Connection) -> Result<(), Error> {
        (self.notify)(Update::Connected(connection));
        if self.saved.is_none() {
            self.saved = Some(pad.save_slot(self.slot)?);
        }
        let mut status: Option<Status> = None;
        let mut shown: Option<IndicatorKey> = None;
        loop {
            pad.drain()?;
            pad.heartbeat()?;
            match pad.read_battery(SAMPLE_TIMEOUT)? {
                Some(sample) => {
                    let next = classify(sample, status);
                    status = Some(next);
                    (self.notify)(Update::Battery(next, connection));
                    if !self.paused && shown != Some(next.key()) {
                        self.show(pad, next.key())?;
                        shown = Some(next.key());
                    }
                }
                None => (self.notify)(Update::NoSignal(connection)),
            }

            let deadline = Instant::now() + SAMPLE_EVERY;
            while let Some(left) = deadline.checked_duration_since(Instant::now()) {
                match self.next_command(left) {
                    None => break,
                    Some(Command::Quit) => {
                        let _ = self.restore(pad);
                        return Ok(());
                    }
                    Some(Command::Pause) => {
                        self.paused = true;
                        self.restore(pad)?;
                        shown = None;
                    }
                    Some(Command::Resume) => {
                        self.paused = false;
                        if let Some(current) = status {
                            self.show(pad, current.key())?;
                            shown = Some(current.key());
                        }
                    }
                }
            }
        }
    }

    fn show(&self, pad: &mut Controller, key: IndicatorKey) -> Result<(), Error> {
        pad.set_slot(self.slot, &indicator(key).animation(), self.slot as u8)
    }

    fn restore(&self, pad: &mut Controller) -> Result<(), Error> {
        match &self.saved {
            Some(saved) => pad.set_slot(self.slot, &saved.animation, saved.active),
            None => Ok(()),
        }
    }

    fn next_command(&self, timeout: Duration) -> Option<Command> {
        match self.commands.recv_timeout(timeout) {
            Ok(command) => Some(command),
            Err(RecvTimeoutError::Timeout) => None,
            Err(RecvTimeoutError::Disconnected) => Some(Command::Quit),
        }
    }
}
