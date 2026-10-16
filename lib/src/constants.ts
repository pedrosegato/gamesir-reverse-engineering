/**
 * Constantes do protocolo HID, extraídas do GameSir Connect v1.16.7.
 *
 * Referências no bundle `decompiled/dist/electron/main.js` (nomes minificados):
 * `Oo.Values` (tamanhos), `ps` (montagem de comandos), `As`/`ks` (tipos de
 * resposta) e a tabela de dispositivos `Kv` (modelo "C2").
 */

export const VENDOR_ID = 0x3537;
/** Interface vendor-defined usada pelo app para configuração. */
export const CONFIG_USAGE_PAGE = 0xfff0;

/** PIDs do modelo "C2" (CYCLONE 2) na tabela de dispositivos do app. */
export const CyclonePid = {
  /** 4125, cabo. */
  Wired: 0x101d,
  /** 4138, sem fio. */
  Wireless: 0x102a,
  /** 4179, cabo, variante "GS_C2_ADC_DEVICE". */
  WiredAdc: 0x1053,
  /** 4107, sem fio via dongle. */
  WirelessDongle: 0x100b,
} as const;

export const CYCLONE2_PIDS: readonly number[] = Object.values(CyclonePid);

/** Todo comando enviado começa com 0x0F (15). As respostas também. */
export const OUTPUT_REPORT_ID = 0x0f;
/** 18: estado do gamepad + bateria + cores atuais, enviado pelo controle. */
export const STATE_REPORT_ID = 0x12;

export const PACKET_SIZE = 64;
/** `EveryOutPacketLength`: payload máximo por pacote de leitura/escrita de perfil. */
export const CHUNK_SIZE = 58;

/** `EveryPacketLength`: perfis de jogo 1–4 e Shift. */
export const GAME_PROFILE_SIZE = 680;
/** `LightProfilePacketLength`: perfil de luz (32). */
export const LIGHT_PROFILE_SIZE = 635;

/** Números de perfil aceitos pelos comandos de leitura/escrita/troca. */
export const Profile = {
  P1: 1,
  P2: 2,
  P3: 3,
  P4: 4,
  /** `ShiftProfileNumber`. */
  Shift: 5,
  /** `LightProfileNumber`. */
  Light: 32,
  /** `CurrentOfProfileNumber`: só aparece em notificações ProfileChanged. */
  Current: 48,
} as const;

/** Byte 1 de cada pacote 0x0F, enviado e recebido. Tabela `ks` do app. */
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
  /** ReadRGB / SetLightStatus (mesmo opcode). */
  LightStatus: 0x0d,
  ReadRgbAck: 0x0e,
  /** Notificação espontânea do controle. */
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

export type CmdName = keyof typeof Cmd;

export function cmdName(cmd: number): string {
  const entry = Object.entries(Cmd).find(([, v]) => v === cmd);
  return entry ? entry[0] : `Unknown_0x${cmd.toString(16).padStart(2, "0")}`;
}

/** Ordem das 5 cores no report de estado (array `au` do proxy C2). */
export const LED_ZONES = ["Home", "LowerLeft", "LowerRight", "UpperLeft", "UpperRight"] as const;
export type LedZone = (typeof LED_ZONES)[number];
