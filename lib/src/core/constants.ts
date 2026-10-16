export const VENDOR_ID = 0x3537;
export const CONFIG_USAGE_PAGE = 0xfff0;

export const OUTPUT_REPORT_ID = 0x0f;
export const RESPONSE_REPORT_ID = 0x10;
export const STATE_REPORT_ID = 0x12;

export const PACKET_SIZE = 64;
export const CHUNK_SIZE = 58;

export const Profile = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  Shift: 5,
  Light: 32,
  Current: 48,
} as const;

export type GameProfileNumber = 1 | 2 | 3 | 4 | 5;

export const Cmd = {
  EnterProfileConfig: 0x01,
  ExitProfileConfig: 0x02,
  WriteProfile: 0x03,
  ReadProfile: 0x04,
  ReadProfileAck: 0x05,
  Ack: 0x06,
  SwitchProfile: 0x07,
  WriteProfileToEeprom: 0x08,
  ReadFwVersion: 0x09,
  ReadFwVersionAck: 0x0a,
  ReadCurrentProfile: 0x0b,
  ReadCurrentProfileAck: 0x0c,
  LightStatus: 0x0d,
  ReadRgbAck: 0x0e,
  ProfileChanged: 0x0f,
  RefreshProfile: 0x10,
  RefreshProfileAck: 0x11,
  WriteEeprom: 0x12,
  WriteEepromAck: 0x13,
  ReadEeprom: 0x14,
  ReadEepromAck: 0x15,
  MacroRecord: 0x16,
  QuickUpdate: 0x17,
  Vibrate: 0x20,
  Download: 0xf0,
  DownloadAck: 0xf1,
  Heartbeat: 0xf2,
  ReadKeyStatus: 0xf3,
  ReadKeyStatusAck: 0xf4,
  RequestUpgrade: 0xfc,
  Calibration: 0xfd,
} as const;

export function cmdName(cmd: number): string {
  const entry = Object.entries(Cmd).find(([, v]) => v === cmd);
  return entry ? entry[0] : `Unknown_0x${cmd.toString(16).padStart(2, "0")}`;
}
