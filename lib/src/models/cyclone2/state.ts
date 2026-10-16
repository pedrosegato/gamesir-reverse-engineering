import type { Rgb } from "../../core/color.js";
import { STATE_REPORT_ID } from "../../core/constants.js";
import { LED_ZONES, type LedZone, type MacroButton } from "./constants.js";

const Offset = {
  Inputs: 1,
  ImuCounter: 11,
  Gyro: 13,
  Accel: 19,
  ChargeState: 35,
  BatteryLevel: 36,
  LightConfigIndex: 37,
  LedColors: 38,
  MacroRecord: 53,
  PhysicalInputs: 54,
  /** L4/R4/M only exist here (`System` byte of the physical inputs); they apply to both blocks. */
  BackButtons: 60,
} as const;

const BlockOffset = {
  LeftX: 0,
  LeftY: 1,
  RightX: 2,
  RightY: 3,
  HatAndFace: 4,
  Shoulders: 5,
  System: 6,
  LeftTrigger: 7,
  RightTrigger: 8,
} as const;

const MIN_LENGTH = Offset.PhysicalInputs + BlockOffset.RightTrigger + 1;

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

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Raw int16, uncalibrated. With the controller lying flat, buttons up: X → right side,
 * Y → out of the face, Z → toward the player. The gyro follows the right-hand rule.
 */
export interface Imu {
  /** 8 bits; wraps after 255. */
  counter: number;
  gyro: Vec3;
  accel: Vec3;
}

export interface Inputs {
  leftStick: StickPosition;
  rightStick: StickPosition;
  hat: Hat;
  buttons: Buttons;
  leftTrigger: number;
  rightTrigger: number;
}

/** The top-level `Inputs` fields have already gone through the active profile's mapping. */
export interface Cyclone2State extends Inputs {
  physical: Inputs;
  imu: Imu;
  chargeState: number;
  batteryLevel: number;
  lightConfigIndex: number;
  leds: Record<LedZone, Rgb>;
  macroRecording: boolean;
  macroRecordKey: MacroButton | null;
  raw: Uint8Array;
}

const bit = (byte: number, n: number) => (byte & (1 << n)) !== 0;

function axis(value: number): number {
  const delta = value - 128;
  return Math.round((1e4 * delta) / (delta > 0 ? 127 : 128)) / 1e4;
}

export function isStateReport(data: ArrayLike<number>): boolean {
  return data.length >= MIN_LENGTH && data[0] === STATE_REPORT_ID;
}

function parseInputs(d: Uint8Array, base: number): Inputs {
  const at = (field: keyof typeof BlockOffset) => d[base + BlockOffset[field]];
  const face = at("HatAndFace");
  const shoulders = at("Shoulders");
  const system = at("System");
  const back = d[Offset.BackButtons];
  return {
    leftStick: { x: axis(at("LeftX")), y: axis(at("LeftY")) },
    rightStick: { x: axis(at("RightX")), y: axis(at("RightY")) },
    hat: HAT_DIRECTIONS[face & 0x0f] ?? null,
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
    leftTrigger: at("LeftTrigger"),
    rightTrigger: at("RightTrigger"),
  };
}

export function parseState(data: ArrayLike<number>): Cyclone2State {
  if (!isStateReport(data)) throw new Error("not a complete 0x12 state report");
  const d = Uint8Array.from(data);
  const macro = d[Offset.MacroRecord];
  const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const vec3 = (o: number): Vec3 => ({
    x: view.getInt16(o, true),
    y: view.getInt16(o + 2, true),
    z: view.getInt16(o + 4, true),
  });

  const leds = {} as Record<LedZone, Rgb>;
  LED_ZONES.forEach((zone, i) => {
    const o = Offset.LedColors + i * 3;
    leds[zone] = { r: d[o], g: d[o + 1], b: d[o + 2] };
  });

  return {
    ...parseInputs(d, Offset.Inputs),
    physical: parseInputs(d, Offset.PhysicalInputs),
    imu: { counter: d[Offset.ImuCounter], gyro: vec3(Offset.Gyro), accel: vec3(Offset.Accel) },
    chargeState: d[Offset.ChargeState],
    batteryLevel: d[Offset.BatteryLevel],
    lightConfigIndex: d[Offset.LightConfigIndex],
    leds,
    macroRecording: bit(macro, 0) || bit(macro, 1),
    macroRecordKey: bit(macro, 4) ? "L4" : bit(macro, 5) ? "R4" : null,
    raw: d,
  };
}
