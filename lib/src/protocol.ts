/**
 * Montagem e interpretação de pacotes, sem I/O.
 *
 * Cada builder espelha um método do objeto `ps` do GameSir Connect (main.js).
 * Os pacotes saem sempre com 64 bytes: byte 0 = report ID 0x0F, byte 1 = comando.
 */

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

/** Monta um pacote de 64 bytes: [0x0F, cmd, ...args, 0...]. */
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

/** Divide [offset, offset+length) em blocos de até 58 bytes. */
function* chunks(offset: number, length: number): Generator<{ offset: number; size: number; index: number }> {
  for (let index = 0; index < length; index += CHUNK_SIZE) {
    yield { offset: offset + index, size: Math.min(CHUNK_SIZE, length - index), index };
  }
}

// --- Sessão / informação ---------------------------------------------------------

/**
 * [0F F2 mode]. O app envia a cada 1 s enquanto a janela está em foco, e uma
 * vez ao abrir o dispositivo. Mantém o controle enviando o report 0x12.
 * `testMode` corresponde ao estado `IsTestMode` do app.
 */
export function heartbeat(testMode = false): Uint8Array {
  return packet(Cmd.Heartbeat, testMode ? 1 : 0);
}

/** [0F 01]. Existe no app, mas o proxy do Cyclone 2 não usa. */
export function enterProfileConfig(): Uint8Array {
  return packet(Cmd.EnterProfileConfig);
}

/** [0F 02 save]. Existe no app, mas o proxy do Cyclone 2 não usa. */
export function exitProfileConfig(save: boolean): Uint8Array {
  return packet(Cmd.ExitProfileConfig, save ? 1 : 0);
}

/** [0F 09] → ReadFwVersionAck (0x0A). */
export function readFwVersion(): Uint8Array {
  return packet(Cmd.ReadFwVersion);
}

/** [0F 0B] → ReadCurrentProfileAck (0x0C); byte 2 = perfil ativo. */
export function readCurrentProfile(): Uint8Array {
  return packet(Cmd.ReadCurrentProfile);
}

/** [0F 07 n]. n = 1..4 ou 5 (Shift). Troca o perfil de jogo ativo. */
export function switchProfile(profileNum: number | "Shift"): Uint8Array {
  return packet(Cmd.SwitchProfile, profileNum === "Shift" ? Profile.Shift : profileNum);
}

// --- Perfis ----------------------------------------------------------------------

/**
 * [0F 04 n offHi offLo len], um por bloco de 58 bytes do perfil inteiro.
 * Respostas: ReadProfileAck (0x05) com os dados a partir do byte 6.
 */
export function readProfile(profileNum: number): Uint8Array[] {
  return [...chunks(0, profileSize(profileNum))].map(({ offset, size }) =>
    packet(Cmd.ReadProfile, profileNum, offset >> 8, offset & 0xff, size),
  );
}

/**
 * [0F 03 n offHi offLo len data...] em blocos de 58 bytes.
 *
 * O app escreve só o trecho que mudou (diff entre o perfil antigo e o novo),
 * um pacote por vez, esperando o Ack (0x06) de cada um. Não existe comando de
 * "commit": o controle aplica a escrita na hora.
 */
export function writeProfile(profileNum: number, data: ArrayLike<number>, offset = 0): Uint8Array[] {
  if (offset + data.length > profileSize(profileNum)) throw new RangeError("escrita passa do fim do perfil");
  const bytes = Array.from(data);
  return [...chunks(offset, bytes.length)].map(({ offset: off, size, index }) =>
    packet(Cmd.WriteProfile, profileNum, off >> 8, off & 0xff, size, ...bytes.slice(index, index + size)),
  );
}

/**
 * [0F 10 n offHi offLo len]: relê um trecho do perfil. O app usa isto ao
 * receber ProfileChanged (0x0F), quando o perfil muda pelo próprio controle.
 * Resposta: RefreshProfileAck (0x11), dados a partir do byte 6.
 */
export function refreshProfile(profileNum: number, offset: number, length: number): Uint8Array[] {
  return [...chunks(offset, length)].map(({ offset: off, size }) =>
    packet(Cmd.RefreshProfile, profileNum, off >> 8, off & 0xff, size),
  );
}

// --- Luzes ----------------------------------------------------------------------

/** [0F 0D playing frame]. Evento `reqSetLightStatus` do app. */
export function setLightStatus(playing: boolean, frameIndex = 0): Uint8Array {
  return packet(Cmd.LightStatus, playing ? 1 : 0, frameIndex);
}

/**
 * [0F 0D]. Evento `reqGetRgbState`. No fio é igual a `setLightStatus(false, 0)`,
 * porque o pacote é completado com zeros. As cores atuais chegam no report 0x12.
 */
export function readRgb(): Uint8Array {
  return packet(Cmd.LightStatus);
}

// --- Motores, macro, calibração, firmware -------------------------------------------

/** [0F 20 66 55 L R]. Liga os motores. O app manda (0, 0) depois de `duration` (padrão 1 s). */
export function vibrate(left: number, right: number): Uint8Array {
  return packet(Cmd.Vibrate, 0x66, 0x55, left, right);
}

/** [0F 16 key state]. key: 1 = FL1 (L4), 2 = FR1 (R4). */
export function setMacroRecord(button: "FL1" | "FR1", state: number): Uint8Array {
  return packet(Cmd.MacroRecord, button === "FL1" ? 1 : 2, state);
}

/** [0F FD state]. Modo de calibração. */
export function setCalibrationState(state: number): Uint8Array {
  return packet(Cmd.Calibration, state);
}

/** [0F 17 55 88]. Atualização rápida de firmware. Deixa o controle em modo de atualização. */
export function quickUpdate(): Uint8Array {
  return packet(Cmd.QuickUpdate, 0x55, 0x88);
}

/** [0F FC]. Entra em modo de upgrade (DFU). */
export function enterUpgradeMode(): Uint8Array {
  return packet(Cmd.RequestUpgrade);
}

// --- Respostas ------------------------------------------------------------------

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

/** Notificação ProfileChanged: o controle avisa que um trecho de um perfil mudou. */
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

/** Ack com byte 2 = 1 significa "ocupado" (`AckWithBusy`): o app ignora e reenvia depois. */
export function isBusyAck(raw: ArrayLike<number>): boolean {
  return raw[1] === Cmd.Ack && raw[2] === 1;
}

/** Dados de ReadProfileAck / RefreshProfileAck. */
export function parseProfileChunk(raw: ArrayLike<number>): ProfileChunk {
  const length = raw[5];
  return {
    profileNum: raw[2],
    offset: (raw[3] << 8) | raw[4],
    data: Uint8Array.from(Array.prototype.slice.call(raw, 6, 6 + length) as number[]),
  };
}

export function parseProfileChange(raw: ArrayLike<number>): ProfileChange {
  return {
    profileNum: raw[2],
    offset: (raw[3] << 8) | raw[4],
    length: (raw[5] << 8) | raw[6],
  };
}
