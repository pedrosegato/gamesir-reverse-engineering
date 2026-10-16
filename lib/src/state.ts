/**
 * Report de estado 0x12 (18), enviado pelo controle na interface 0xFFF0
 * enquanto recebe heartbeats.
 *
 * Fontes no main.js: `ie()` (botões/eixos), `Us.push()` (FL1/FR1/M vêm do
 * bloco a partir do byte 53) e `ou.parseGamepadState()` (bateria e cores, bytes 35..53).
 * Os índices abaixo contam o report ID como byte 0, igual ao node-hid.
 */

import type { Rgb } from "./color.js";
import { LED_ZONES, type LedZone, STATE_REPORT_ID } from "./constants.js";

export type Hat = "Up" | "UpRight" | "Right" | "DownRight" | "Down" | "DownLeft" | "Left" | "UpLeft" | null;

const HAT: readonly Hat[] = ["Up", "UpRight", "Right", "DownRight", "Down", "DownLeft", "Left", "UpLeft"];

export interface Stick {
  /** -1 (esquerda) .. 1 (direita). */
  x: number;
  /** -1 (cima) .. 1 (baixo), como vem do controle. */
  y: number;
}

export interface Buttons {
  /** Nomes Xbox (como o app mostra para o C2) com o nome interno do app ao lado. */
  A: boolean; // CRO
  B: boolean; // CIR
  X: boolean; // SQU
  Y: boolean; // TRI
  LB: boolean; // L1
  RB: boolean; // R1
  LT: boolean; // L2 (digital)
  RT: boolean; // R2 (digital)
  View: boolean; // Sel / Share
  Menu: boolean; // Sta / Options
  LS: boolean; // L3
  RS: boolean; // R3
  Home: boolean; // PS
  Capture: boolean; // Camera
  L4: boolean; // FL1 (traseiro esquerdo)
  R4: boolean; // FR1 (traseiro direito)
  M: boolean;
}

export interface GamepadState {
  leftStick: Stick;
  rightStick: Stick;
  hat: Hat;
  buttons: Buttons;
  /** 0..255 */
  leftTrigger: number;
  /** 0..255 */
  rightTrigger: number;
  /** Byte 35. O controle reporta 1 quando está carregando. */
  chargeState: number;
  /** Byte 36, em %. */
  batteryLevel: number;
  /** Byte 37: índice do modo de luz ativo (ConfigIndex do perfil de luz). */
  lightConfigIndex: number;
  /** Bytes 38..52: cor atual de cada zona de LED. */
  leds: Record<LedZone, Rgb>;
  /** Byte 53, bits 0/1: gravação de macro em andamento. */
  macroRecording: boolean;
  /** Byte 53, bit 4 = FL1 (L4), bit 5 = FR1 (R4). */
  macroRecordKey: "FL1" | "FR1" | null;
  raw: Uint8Array;
}

const bit = (b: number, n: number) => (b & (1 << n)) !== 0;

function axis(v: number): number {
  const t = v - 128;
  if (t === 0) return 0;
  return Math.round((1e4 * t) / (t > 0 ? 127 : 128)) / 1e4;
}

export function isStateReport(data: ArrayLike<number>): boolean {
  return data.length >= 54 && data[0] === STATE_REPORT_ID;
}

export function parseState(data: ArrayLike<number>): GamepadState {
  if (!isStateReport(data)) throw new Error("não é um report de estado 0x12 completo");
  const d = Uint8Array.from(data);
  const hatNibble = d[5] & 0x0f;
  const leds = {} as Record<LedZone, Rgb>;
  LED_ZONES.forEach((zone, i) => {
    const o = 38 + i * 3;
    leds[zone] = { r: d[o], g: d[o + 1], b: d[o + 2] };
  });
  // FL1/FR1/M: o app sobrescreve os bits do byte 7 com os do byte 60 (53 + 7).
  const extra = d.length > 60 ? d[60] : d[7];
  return {
    leftStick: { x: axis(d[1]), y: axis(d[2]) },
    rightStick: { x: axis(d[3]), y: axis(d[4]) },
    hat: hatNibble < 8 ? HAT[hatNibble] : null,
    buttons: {
      X: bit(d[5], 4),
      A: bit(d[5], 5),
      B: bit(d[5], 6),
      Y: bit(d[5], 7),
      LB: bit(d[6], 0),
      RB: bit(d[6], 1),
      LT: bit(d[6], 2),
      RT: bit(d[6], 3),
      View: bit(d[6], 4),
      Menu: bit(d[6], 5),
      LS: bit(d[6], 6),
      RS: bit(d[6], 7),
      Home: bit(d[7], 0),
      Capture: bit(d[7], 1),
      L4: bit(extra, 3),
      R4: bit(extra, 4),
      M: bit(extra, 5),
    },
    leftTrigger: d[8],
    rightTrigger: d[9],
    chargeState: d[35],
    batteryLevel: d[36],
    lightConfigIndex: d[37],
    leds,
    macroRecording: bit(d[53], 0) || bit(d[53], 1),
    macroRecordKey: bit(d[53], 4) ? "FL1" : bit(d[53], 5) ? "FR1" : null,
    raw: d,
  };
}
