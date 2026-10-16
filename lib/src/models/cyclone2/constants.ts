export const Cyclone2Pid = {
  Wired: 0x101d,
  WiredAdc: 0x1053,
  Wireless: 0x102a,
  WirelessDongle: 0x100b,
} as const;

/** Dongle with no controller connected; does not answer commands. */
export const DONGLE_IDLE_PID = 0x0575;

export const GAME_PROFILE_SIZE = 680;
export const LIGHT_PROFILE_SIZE = 635;

export const LED_ZONES = ["Home", "LowerLeft", "LowerRight", "UpperLeft", "UpperRight"] as const;
export type LedZone = (typeof LED_ZONES)[number];

export const MacroButton = { L4: 1, R4: 2 } as const;
export type MacroButton = keyof typeof MacroButton;
