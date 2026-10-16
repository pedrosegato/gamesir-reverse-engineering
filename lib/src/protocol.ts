import {
  CHUNK_SIZE,
  Cmd,
  cmdName,
  GAME_PROFILE_SIZE,
  LIGHT_PROFILE_SIZE,
  OUTPUT_REPORT_ID,
  PACKET_SIZE,
  Profile,
} from "./constants.js";

const VIBRATE_MAGIC = [0x66, 0x55];
const QUICK_UPDATE_MAGIC = [0x55, 0x88];

export function packet(cmd: number, ...args: number[]): Uint8Array {
  const body = [OUTPUT_REPORT_ID, cmd, ...args];
  if (body.length > PACKET_SIZE) throw new RangeError(`pacote com ${body.length} bytes (máximo ${PACKET_SIZE})`);
  for (const b of body) {
    if (!Number.isInteger(b) || b < 0 || b > 0xff) throw new RangeError(`byte fora do intervalo: ${b}`);
  }
  const out = new Uint8Array(PACKET_SIZE);
  out.set(body);
  return out;
}

export function profileSize(profileNum: number): number {
  return profileNum === Profile.Light ? LIGHT_PROFILE_SIZE : GAME_PROFILE_SIZE;
}

function* chunks(offset: number, length: number): Generator<{ offset: number; size: number; index: number }> {
  for (let index = 0; index < length; index += CHUNK_SIZE) {
    yield { offset: offset + index, size: Math.min(CHUNK_SIZE, length - index), index };
  }
}

const hi = (n: number) => n >> 8;
const lo = (n: number) => n & 0xff;

export const heartbeat = (testMode = false) => packet(Cmd.Heartbeat, testMode ? 1 : 0);
export const enterProfileConfig = () => packet(Cmd.EnterProfileConfig);
export const exitProfileConfig = (save: boolean) => packet(Cmd.ExitProfileConfig, save ? 1 : 0);
export const readFwVersion = () => packet(Cmd.ReadFwVersion);
export const readCurrentProfile = () => packet(Cmd.ReadCurrentProfile);
export const switchProfile = (profileNum: number | "Shift") =>
  packet(Cmd.SwitchProfile, profileNum === "Shift" ? Profile.Shift : profileNum);

export function readProfile(profileNum: number): Uint8Array[] {
  return [...chunks(0, profileSize(profileNum))].map(({ offset, size }) =>
    packet(Cmd.ReadProfile, profileNum, hi(offset), lo(offset), size),
  );
}

export function writeProfile(profileNum: number, data: ArrayLike<number>, offset = 0): Uint8Array[] {
  if (offset + data.length > profileSize(profileNum)) throw new RangeError("escrita passa do fim do perfil");
  const bytes = Array.from(data);
  return [...chunks(offset, bytes.length)].map(({ offset: off, size, index }) =>
    packet(Cmd.WriteProfile, profileNum, hi(off), lo(off), size, ...bytes.slice(index, index + size)),
  );
}

export function refreshProfile(profileNum: number, offset: number, length: number): Uint8Array[] {
  return [...chunks(offset, length)].map(({ offset: off, size }) =>
    packet(Cmd.RefreshProfile, profileNum, hi(off), lo(off), size),
  );
}

export const setLightStatus = (playing: boolean, frameIndex = 0) =>
  packet(Cmd.LightStatus, playing ? 1 : 0, frameIndex);

/** Mesmo opcode de `setLightStatus`: no fio é idêntico a `setLightStatus(false, 0)`. */
export const readRgb = () => packet(Cmd.LightStatus);

export const vibrate = (left: number, right: number) => packet(Cmd.Vibrate, ...VIBRATE_MAGIC, left, right);

export const MacroKey = { FL1: 1, FR1: 2 } as const;
export const MacroRecordState = { Cancel: 0, Start: 1, Stop: 2 } as const;
export type MacroRecordState = (typeof MacroRecordState)[keyof typeof MacroRecordState];
export const setMacroRecord = (button: keyof typeof MacroKey, state: MacroRecordState) =>
  packet(Cmd.MacroRecord, MacroKey[button], state);

export const setCalibrationState = (state: number) => packet(Cmd.Calibration, state);

/** Coloca o controle em modo de atualização de firmware. */
export const quickUpdate = () => packet(Cmd.QuickUpdate, ...QUICK_UPDATE_MAGIC);

/** Coloca o controle em modo DFU. */
export const enterUpgradeMode = () => packet(Cmd.RequestUpgrade);

export interface Response {
  cmd: number;
  name: string;
  raw: Uint8Array;
}

export interface ProfileChunk {
  profileNum: number;
  offset: number;
  data: Uint8Array;
}

export interface ProfileChange {
  profileNum: number;
  offset: number;
  length: number;
}

export function parseResponse(data: ArrayLike<number>): Response | null {
  if (data.length < 2 || data[0] !== OUTPUT_REPORT_ID) return null;
  const raw = Uint8Array.from(data);
  return { cmd: raw[1], name: cmdName(raw[1]), raw };
}

export const isBusyAck = (raw: ArrayLike<number>) => raw[1] === Cmd.Ack && raw[2] === 1;

export function parseProfileChunk(raw: ArrayLike<number>): ProfileChunk {
  const bytes = Uint8Array.from(raw);
  return {
    profileNum: bytes[2],
    offset: (bytes[3] << 8) | bytes[4],
    data: bytes.slice(6, 6 + bytes[5]),
  };
}

export interface FirmwareVersion {
  firmware: string;
  /** Vazio no cabo. */
  dongle: string;
  raw: Uint8Array;
}

/** Cada caractere ASCII vira um componente: "123" → "1.2.3". */
function versionAt(raw: Uint8Array, start: number): string {
  const text = new TextDecoder().decode(raw.slice(start, start + 5));
  return text
    .replace(/[\s\0]/g, "")
    .split("")
    .join(".");
}

export function parseFirmwareVersion(raw: ArrayLike<number>): FirmwareVersion {
  const bytes = Uint8Array.from(raw);
  return { firmware: versionAt(bytes, 4), dongle: versionAt(bytes, 12), raw: bytes };
}

export function parseProfileChange(raw: ArrayLike<number>): ProfileChange {
  return {
    profileNum: raw[2],
    offset: (raw[3] << 8) | raw[4],
    length: (raw[5] << 8) | raw[6],
  };
}
