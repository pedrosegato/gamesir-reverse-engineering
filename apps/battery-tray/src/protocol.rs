pub const VENDOR_ID: u16 = 0x3537;
pub const CONFIG_USAGE_PAGE: u16 = 0xFFF0;

pub const REPORT_LEN: usize = 64;
pub const STATE_REPORT_ID: u8 = 0x12;
const OUTPUT_REPORT_ID: u8 = 0x0F;
const HEADER_LEN: usize = 6;
const CHUNK_LEN: usize = REPORT_LEN - HEADER_LEN;

pub const LIGHT_PROFILE: u8 = 32;
pub const CURRENT_PROFILE: u8 = 48;
pub const LIGHT_PROFILE_SIZE: usize = 635;
pub const ACTIVE_ANIMATION_OFFSET: usize = 0;
pub const ANIMATION_SIZE: usize = 124;

pub mod cmd {
    pub const WRITE_PROFILE: u8 = 0x03;
    pub const READ_PROFILE: u8 = 0x04;
    pub const READ_PROFILE_ACK: u8 = 0x05;
    pub const ACK: u8 = 0x06;
    pub const RGB_NOTICE: u8 = 0x0E;
    pub const PROFILE_CHANGED: u8 = 0x0F;
    pub const HEARTBEAT: u8 = 0xF2;
}

pub type Report = [u8; REPORT_LEN];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Connection {
    Cable,
    Dongle,
}

impl Connection {
    pub fn from_pid(pid: u16) -> Option<Self> {
        match pid {
            0x101D | 0x1053 => Some(Self::Cable),
            0x100B | 0x102A => Some(Self::Dongle),
            _ => None,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Cable => "cabo",
            Self::Dongle => "dongle",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BatterySample {
    pub percent: u8,
    pub charging: bool,
}

pub fn packet(cmd: u8, args: &[u8]) -> Report {
    let mut out = [0; REPORT_LEN];
    out[0] = OUTPUT_REPORT_ID;
    out[1] = cmd;
    out[2..2 + args.len()].copy_from_slice(args);
    out
}

pub fn heartbeat() -> Report {
    packet(cmd::HEARTBEAT, &[0])
}

pub fn read_profile(profile: u8, size: usize) -> Vec<Report> {
    (0..size)
        .step_by(CHUNK_LEN)
        .map(|offset| {
            let len = CHUNK_LEN.min(size - offset);
            packet(cmd::READ_PROFILE, &[profile, (offset >> 8) as u8, offset as u8, len as u8])
        })
        .collect()
}

pub fn write_profile(profile: u8, offset: usize, data: &[u8]) -> Vec<Report> {
    data.chunks(CHUNK_LEN)
        .enumerate()
        .map(|(i, chunk)| {
            let at = offset + i * CHUNK_LEN;
            let mut args = vec![profile, (at >> 8) as u8, at as u8, chunk.len() as u8];
            args.extend_from_slice(chunk);
            packet(cmd::WRITE_PROFILE, &args)
        })
        .collect()
}

pub fn chunk_offset(report: &[u8]) -> usize {
    usize::from(report[3]) << 8 | usize::from(report[4])
}

pub fn chunk_data(report: &[u8]) -> &[u8] {
    &report[HEADER_LEN..HEADER_LEN + usize::from(report[5])]
}

pub fn parse_battery(report: &[u8]) -> Option<BatterySample> {
    (report.len() > 36 && report[0] == STATE_REPORT_ID)
        .then(|| BatterySample { percent: report[36], charging: report[35] == 1 })
}

pub fn is_busy(report: &[u8]) -> bool {
    report[1] == cmd::ACK && report[2] == 1
}

pub fn is_notification(report: &[u8]) -> bool {
    matches!(report[1], cmd::RGB_NOTICE | cmd::PROFILE_CHANGED)
}

pub fn animation_offset(slot: usize) -> usize {
    1 + slot * ANIMATION_SIZE
}

pub fn diff_range(a: &[u8], b: &[u8]) -> Option<(usize, usize)> {
    let start = a.iter().zip(b).position(|(x, y)| x != y)?;
    let end = a.iter().zip(b).rposition(|(x, y)| x != y)?;
    Some((start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn heartbeat_matches_the_app() {
        assert_eq!(&heartbeat()[..3], &[0x0F, 0xF2, 0x00]);
    }

    #[test]
    fn light_profile_reads_in_eleven_chunks() {
        let packets = read_profile(LIGHT_PROFILE, LIGHT_PROFILE_SIZE);
        assert_eq!(packets.len(), 11);
        assert_eq!(&packets[0][..6], &[0x0F, 0x04, 32, 0, 0, 58]);
        assert_eq!(&packets[10][..6], &[0x0F, 0x04, 32, 2, 0x44, 55]);
        assert_eq!(chunk_offset(&packets[10]), 580);
    }

    #[test]
    fn writes_split_at_58_bytes() {
        let data: Vec<u8> = (0..70).collect();
        let packets = write_profile(1, 600, &data);
        assert_eq!(packets.len(), 2);
        assert_eq!(&packets[0][..7], &[0x0F, 0x03, 1, 2, 88, 58, 0]);
        assert_eq!(&packets[1][..7], &[0x0F, 0x03, 1, 2, 146, 12, 58]);
    }

    #[test]
    fn reads_battery_from_the_state_report() {
        let mut report = [0; REPORT_LEN];
        report[0] = STATE_REPORT_ID;
        report[35] = 1;
        report[36] = 57;
        assert_eq!(parse_battery(&report), Some(BatterySample { percent: 57, charging: true }));
        report[0] = 0x10;
        assert_eq!(parse_battery(&report), None);
    }

    #[test]
    fn finds_the_changed_range() {
        let a = [0u8; 30];
        let mut b = a;
        b[10] = 1;
        b[20] = 1;
        assert_eq!(diff_range(&a, &b), Some((10, 20)));
        assert_eq!(diff_range(&a, &a), None);
    }
}
