use crate::battery::{IndicatorKey, Level};
use crate::protocol::ANIMATION_SIZE;

pub type Rgb = [u8; 3];

const FRAMES_OFFSET: usize = 4;
const FRAME_LEN: usize = 15;
/// Zonas no frame: LowerLeft, LowerRight, UpperLeft, Home, UpperRight.
const HOME_IN_FRAME: usize = 9;
const ZONES_PER_FRAME: u8 = 5;
const MAX_SPEED: u8 = 20;
const BRIGHTNESS: u8 = 100;
const DEFAULT_SPEED: u8 = 10;

const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [255, 0, 0];
const OFF: Rgb = [0, 0, 0];
const CHARGING: &[Rgb] = &[[255, 0, 0], [255, 150, 0], [255, 255, 0], [0, 255, 0], [0, 150, 255], [180, 0, 255]];

pub struct Indicator {
    pub label: &'static str,
    pub icon: Rgb,
    frames: &'static [Rgb],
    speed: u8,
}

pub fn indicator(key: IndicatorKey) -> Indicator {
    let (label, icon, frames, speed): (_, _, &'static [Rgb], _) = match key {
        IndicatorKey::Charged => ("carregada", WHITE, &[WHITE], DEFAULT_SPEED),
        IndicatorKey::Charging => ("carregando", [0, 150, 255], CHARGING, 12),
        IndicatorKey::Level(Level::Critical) => ("crítica", RED, &[RED, OFF], 18),
        IndicatorKey::Level(Level::Low) => ("baixa", RED, &[RED], DEFAULT_SPEED),
        IndicatorKey::Level(Level::Medium) => ("média", [255, 180, 0], &[[255, 180, 0]], DEFAULT_SPEED),
        IndicatorKey::Level(Level::Good) => ("boa", [80, 255, 0], &[[80, 255, 0]], DEFAULT_SPEED),
        IndicatorKey::Level(Level::High) => ("alta", [0, 255, 0], &[[0, 255, 0]], DEFAULT_SPEED),
    };
    Indicator { label, icon, frames, speed }
}

impl Indicator {
    pub fn animation(&self) -> [u8; ANIMATION_SIZE] {
        let mut out = [0; ANIMATION_SIZE];
        out[0] = self.frames.len() as u8;
        out[1] = ZONES_PER_FRAME;
        out[2] = MAX_SPEED - self.speed;
        out[3] = BRIGHTNESS;
        for (f, color) in self.frames.iter().enumerate() {
            let at = FRAMES_OFFSET + f * FRAME_LEN + HOME_IN_FRAME;
            out[at..at + 3].copy_from_slice(color);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn critical_blinks_red_on_home_only() {
        let anim = indicator(IndicatorKey::Level(Level::Critical)).animation();
        assert_eq!(&anim[..4], &[2, 5, 2, 100]);
        assert_eq!(&anim[4..19], &[0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0]);
        assert!(anim[19..].iter().all(|&b| b == 0));
    }

    #[test]
    fn charging_cycles_six_colors() {
        let anim = indicator(IndicatorKey::Charging).animation();
        assert_eq!(anim[0], 6);
        assert_eq!(anim[2], 8);
        assert_eq!(&anim[4 + 5 * 15 + 9..4 + 5 * 15 + 12], &[180, 0, 255]);
    }
}
