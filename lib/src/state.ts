import type { Rgb } from "./color.js";
import { LED_ZONES, type LedZone, STATE_REPORT_ID } from "./constants.js";

const Offset = {
  LeftX: 1,
  LeftY: 2,
  RightX: 3,
  RightY: 4,
  HatAndFace: 5,
  Shoulders: 6,
  System: 7,
  LeftTrigger: 8,
  RightTrigger: 9,
  ImuCounter: 11,
  Gyro: 13,
  Accel: 19,
  ChargeState: 35,
  BatteryLevel: 36,
  LightConfigIndex: 37,
  LedColors: 38,
  MacroRecord: 53,
  /** O app lê L4/R4/M daqui, não do byte `System`. */
  BackButtons: 60,
} as const;

const MIN_LENGTH = Offset.MacroRecord + 1;

export type Hat = "Up" | "UpRight" | "Right" | "DownRight" | "Down" | "DownLeft" | "Left" | "UpLeft" | null;

const HAT_DIRECTIONS: readonly Hat[] = ["Up", "UpRight", "Right", "DownRight", "Down", "DownLeft", "Left", "UpLeft"];

export interface StickPosition {
  x: number;
  y: number;
}

export interface Buttons {
  A: boolean;
  B: boolean;
  X: boolean;
  Y: boolean;
  LB: boolean;
  RB: boolean;
  LT: boolean;
  RT: boolean;
  View: boolean;
  Menu: boolean;
  LS: boolean;
  RS: boolean;
  Home: boolean;
  Capture: boolean;
  L4: boolean;
  R4: boolean;
  M: boolean;
}

/** Valores crus int16. Parado na mesa, |accel| ≈ 8192 (1 g). Nome dos eixos ainda não confirmado. */
export interface Imu {
  /** Contador de 8 bits, avança a cada amostra. */
  counter: number;
  gyro: [number, number, number];
  accel: [number, number, number];
}

export interface GamepadState {
  leftStick: StickPosition;
  rightStick: StickPosition;
  hat: Hat;
  buttons: Buttons;
  leftTrigger: number;
  rightTrigger: number;
  imu: Imu;
  chargeState: number;
  batteryLevel: number;
  lightConfigIndex: number;
  leds: Record<LedZone, Rgb>;
  macroRecording: boolean;
  macroRecordKey: "FL1" | "FR1" | null;
  raw: Uint8Array;
}

const bit = (byte: number, n: number) => (byte & (1 << n)) !== 0;

/** 0..255 com centro em 128 → -1..1. */
function axis(value: number): number {
  const delta = value - 128;
  return Math.round((1e4 * delta) / (delta > 0 ? 127 : 128)) / 1e4;
}

export function isStateReport(data: ArrayLike<number>): boolean {
  return data.length >= MIN_LENGTH && data[0] === STATE_REPORT_ID;
}

export function parseState(data: ArrayLike<number>): GamepadState {
  if (!isStateReport(data)) throw new Error("não é um report de estado 0x12 completo");
  const d = Uint8Array.from(data);
  const face = d[Offset.HatAndFace];
  const shoulders = d[Offset.Shoulders];
  const system = d[Offset.System];
  const back = d.length > Offset.BackButtons ? d[Offset.BackButtons] : system;
  const macro = d[Offset.MacroRecord];
  const hatValue = face & 0x0f;
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const vec3 = (o: number): [number, number, number] => [
    view.getInt16(o, true),
    view.getInt16(o + 2, true),
    view.getInt16(o + 4, true),
  ];

  const leds = {} as Record<LedZone, Rgb>;
  LED_ZONES.forEach((zone, i) => {
    const o = Offset.LedColors + i * 3;
    leds[zone] = { r: d[o], g: d[o + 1], b: d[o + 2] };
  });

  return {
    leftStick: { x: axis(d[Offset.LeftX]), y: axis(d[Offset.LeftY]) },
    rightStick: { x: axis(d[Offset.RightX]), y: axis(d[Offset.RightY]) },
    hat: HAT_DIRECTIONS[hatValue] ?? null,
    buttons: {
      X: bit(face, 4),
      A: bit(face, 5),
      B: bit(face, 6),
      Y: bit(face, 7),
      LB: bit(shoulders, 0),
      RB: bit(shoulders, 1),
      LT: bit(shoulders, 2),
      RT: bit(shoulders, 3),
      View: bit(shoulders, 4),
      Menu: bit(shoulders, 5),
      LS: bit(shoulders, 6),
      RS: bit(shoulders, 7),
      Home: bit(system, 0),
      Capture: bit(system, 1),
      L4: bit(back, 3),
      R4: bit(back, 4),
      M: bit(back, 5),
    },
    leftTrigger: d[Offset.LeftTrigger],
    rightTrigger: d[Offset.RightTrigger],
    imu: { counter: d[Offset.ImuCounter], gyro: vec3(Offset.Gyro), accel: vec3(Offset.Accel) },
    chargeState: d[Offset.ChargeState],
    batteryLevel: d[Offset.BatteryLevel],
    lightConfigIndex: d[Offset.LightConfigIndex],
    leds,
    macroRecording: bit(macro, 0) || bit(macro, 1),
    macroRecordKey: bit(macro, 4) ? "FL1" : bit(macro, 5) ? "FR1" : null,
    raw: d,
  };
}
