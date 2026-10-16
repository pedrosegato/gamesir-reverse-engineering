use std::fmt;
use std::time::{Duration, Instant};

use hidapi::{HidApi, HidDevice, HidError};

use crate::protocol::{self as p, BatterySample, Connection, Report};

const RESPONSE_TIMEOUT: Duration = Duration::from_millis(200);
const MAX_SENDS: usize = 10;

#[derive(Debug)]
pub enum Error {
    Hid(HidError),
    NoResponse,
}

impl From<HidError> for Error {
    fn from(error: HidError) -> Self {
        Self::Hid(error)
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Hid(error) => write!(f, "{error}"),
            Self::NoResponse => write!(f, "o controle não respondeu"),
        }
    }
}

pub struct SavedSlot {
    pub active: u8,
    pub animation: [u8; p::ANIMATION_SIZE],
}

pub struct Controller {
    device: HidDevice,
    light: Option<Vec<u8>>,
}

impl Controller {
    pub fn find(api: &mut HidApi) -> Option<(Self, Connection)> {
        api.refresh_devices().ok()?;
        api.device_list().filter(|d| d.vendor_id() == p::VENDOR_ID && d.usage_page() == p::CONFIG_USAGE_PAGE).find_map(
            |d| {
                let connection = Connection::from_pid(d.product_id())?;
                let device = d.open_device(api).ok()?;
                Some((Self { device, light: None }, connection))
            },
        )
    }

    pub fn heartbeat(&self) -> Result<(), Error> {
        self.device.write(&p::heartbeat())?;
        Ok(())
    }

    pub fn drain(&mut self) -> Result<(), Error> {
        while let Some(report) = self.read(Duration::ZERO)? {
            self.note(&report);
        }
        Ok(())
    }

    pub fn read_battery(&mut self, timeout: Duration) -> Result<Option<BatterySample>, Error> {
        let deadline = Instant::now() + timeout;
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            let Some(report) = self.read(left)? else { break };
            if let Some(sample) = p::parse_battery(&report) {
                return Ok(Some(sample));
            }
            self.note(&report);
        }
        Ok(None)
    }

    pub fn save_slot(&mut self, slot: usize) -> Result<SavedSlot, Error> {
        let light = self.light_profile()?;
        let at = p::animation_offset(slot);
        let mut animation = [0; p::ANIMATION_SIZE];
        animation.copy_from_slice(&light[at..at + p::ANIMATION_SIZE]);
        Ok(SavedSlot { active: light[p::ACTIVE_ANIMATION_OFFSET], animation })
    }

    pub fn set_slot(&mut self, slot: usize, animation: &[u8; p::ANIMATION_SIZE], active: u8) -> Result<(), Error> {
        let current = self.light_profile()?;
        let mut next = current.clone();
        let at = p::animation_offset(slot);
        next[at..at + p::ANIMATION_SIZE].copy_from_slice(animation);
        next[p::ACTIVE_ANIMATION_OFFSET] = active;
        if let Some((start, end)) = p::diff_range(&current, &next) {
            for packet in p::write_profile(p::LIGHT_PROFILE, start, &next[start..=end]) {
                self.request(&packet, |r| r[1] == p::cmd::ACK)?;
            }
        }
        self.light = Some(next);
        Ok(())
    }

    fn light_profile(&mut self) -> Result<Vec<u8>, Error> {
        if let Some(light) = &self.light {
            return Ok(light.clone());
        }
        let mut image = vec![0; p::LIGHT_PROFILE_SIZE];
        for packet in p::read_profile(p::LIGHT_PROFILE, p::LIGHT_PROFILE_SIZE) {
            let offset = p::chunk_offset(&packet);
            let report = self.request(&packet, |r| {
                r[1] == p::cmd::READ_PROFILE_ACK && r[2] == p::LIGHT_PROFILE && p::chunk_offset(r) == offset
            })?;
            let data = p::chunk_data(&report);
            image[offset..offset + data.len()].copy_from_slice(data);
        }
        self.light = Some(image.clone());
        Ok(image)
    }

    fn request(&mut self, packet: &Report, accept: impl Fn(&[u8]) -> bool) -> Result<Report, Error> {
        for _ in 0..MAX_SENDS {
            self.device.write(packet)?;
            let deadline = Instant::now() + RESPONSE_TIMEOUT;
            while let Some(left) = deadline.checked_duration_since(Instant::now()) {
                let Some(report) = self.read(left)? else { break };
                if report[0] == p::STATE_REPORT_ID || p::is_busy(&report) {
                    continue;
                }
                if p::is_notification(&report) {
                    self.note(&report);
                } else if accept(&report) {
                    return Ok(report);
                }
            }
        }
        Err(Error::NoResponse)
    }

    /// O controle pode mudar o perfil de luz sozinho (botão M); a cópia em memória deixa de valer.
    fn note(&mut self, report: &[u8]) {
        let changed = report[0] != p::STATE_REPORT_ID && report[1] == p::cmd::PROFILE_CHANGED;
        if changed && matches!(report[2], p::LIGHT_PROFILE | p::CURRENT_PROFILE) {
            self.light = None;
        }
    }

    fn read(&self, timeout: Duration) -> Result<Option<Report>, Error> {
        let mut buf = [0; p::REPORT_LEN];
        let millis = i32::try_from(timeout.as_millis()).unwrap_or(i32::MAX);
        let n = self.device.read_timeout(&mut buf, millis)?;
        Ok((n > 0).then_some(buf))
    }
}
