use crate::protocol::BatterySample;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    Critical,
    Low,
    Medium,
    Good,
    High,
}

const LEVELS: [(Level, u8); 5] =
    [(Level::Critical, 9), (Level::Low, 25), (Level::Medium, 50), (Level::Good, 75), (Level::High, 100)];

/// A leitura oscila ±1 % perto das bordas.
pub const HYSTERESIS: i16 = 2;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Charged,
    Charging { percent: u8 },
    Discharging { percent: u8, level: Level },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum IndicatorKey {
    Charged,
    Charging,
    Level(Level),
}

impl Status {
    pub fn key(self) -> IndicatorKey {
        match self {
            Self::Charged => IndicatorKey::Charged,
            Self::Charging { .. } => IndicatorKey::Charging,
            Self::Discharging { level, .. } => IndicatorKey::Level(level),
        }
    }

    pub fn percent(self) -> u8 {
        match self {
            Self::Charged => 100,
            Self::Charging { percent } | Self::Discharging { percent, .. } => percent,
        }
    }
}

pub fn classify(sample: BatterySample, previous: Option<Status>) -> Status {
    if sample.charging {
        return if sample.percent >= 100 { Status::Charged } else { Status::Charging { percent: sample.percent } };
    }
    let previous_level = match previous {
        Some(Status::Discharging { level, .. }) => Some(level),
        _ => None,
    };
    Status::Discharging { percent: sample.percent, level: level_for(sample.percent, previous_level) }
}

fn level_for(percent: u8, previous: Option<Level>) -> Level {
    let candidate = LEVELS.iter().find(|(_, up_to)| percent <= *up_to).map_or(Level::High, |(level, _)| *level);
    let Some(previous) = previous.filter(|p| *p != candidate) else {
        return candidate;
    };
    let i = LEVELS.iter().position(|(level, _)| *level == previous).unwrap_or(0);
    let floor = i.checked_sub(1).map(|below| i16::from(LEVELS[below].1));
    let ceiling = i16::from(LEVELS[i].1);
    let p = i16::from(percent);
    let still_inside = floor.is_none_or(|f| p > f - HYSTERESIS) && p <= ceiling + HYSTERESIS;
    if still_inside { previous } else { candidate }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn on_battery(percent: u8, previous: Option<Status>) -> Status {
        classify(BatterySample { percent, charging: false }, previous)
    }

    #[test]
    fn on_cable_charging_then_charged() {
        assert_eq!(classify(BatterySample { percent: 57, charging: true }, None), Status::Charging { percent: 57 });
        assert_eq!(classify(BatterySample { percent: 100, charging: true }, None), Status::Charged);
    }

    #[test]
    fn levels_by_percent() {
        let cases = [
            (5, Level::Critical),
            (9, Level::Critical),
            (10, Level::Low),
            (25, Level::Low),
            (26, Level::Medium),
            (50, Level::Medium),
            (75, Level::Good),
            (76, Level::High),
            (100, Level::High),
        ];
        for (percent, level) in cases {
            assert_eq!(on_battery(percent, None).key(), IndicatorKey::Level(level), "{percent}%");
        }
    }

    #[test]
    fn holds_the_level_while_the_reading_jitters() {
        let medium = on_battery(26, None);
        assert_eq!(on_battery(25, Some(medium)).key(), IndicatorKey::Level(Level::Medium));
        assert_eq!(on_battery(24, Some(medium)).key(), IndicatorKey::Level(Level::Medium));
        assert_eq!(on_battery(23, Some(medium)).key(), IndicatorKey::Level(Level::Low));
    }

    #[test]
    fn leaving_the_cable_starts_from_scratch() {
        assert_eq!(on_battery(80, Some(Status::Charged)).key(), IndicatorKey::Level(Level::High));
    }
}
