import { ByteReader, ByteWriter } from "./binary.js";
import { GAME_PROFILE_SIZE } from "./constants.js";

const NAME_SIZE = 32;
const FUN_RESERVED_SIZE = 17;
const MACRO_STEP_COUNT = 30;
const CURVE_POINT_COUNT = 5;

/** Mesma ordem dos blocos no perfil. */
export const MAPPED_BUTTONS = [
  "Up",
  "Down",
  "Left",
  "Right",
  "LB",
  "RB",
  "LS",
  "RS",
  "A",
  "B",
  "X",
  "Y",
  "Home",
  "View",
  "Menu",
  "Capture",
] as const;
export type MappedButton = (typeof MAPPED_BUTTONS)[number];

export const ReportRate = { Hz250: 0, Hz500: 1, Hz1000: 2 } as const;
export const StickOutput = { LeftStick: 1, RightStick: 2, Keys: 3, Mouse: 4 } as const;
export const CurveType = { Linear: 0, Curved: 1, SCurve: 2, Custom: 3 } as const;
export const MotionActivation = { Off: 0, Hold: 1, Toggle: 2, Always: 3 } as const;
export const HairTriggerMode = { Rapid: 1, Fix: 2 } as const;
export const MOTOR_LEVELS = [0, 25, 50, 75, 100] as const;

export interface KeyMapping {
  turboEnabled: boolean;
  /** Hz, 0..30. */
  turboSpeed: number;
  mapEnabled: boolean;
  /** `KeyCode`s pressionados juntos; 0 = vazio. */
  mapTo: [number, number, number];
  toggle: boolean;
}

export interface MacroStep {
  key: number;
  holdMs: number;
  /** Do início deste passo ao início do próximo (o hold fica dentro). O 30º passo não tem delay no perfil. */
  delayMs: number;
}

export interface Macro {
  enabled: boolean;
  /** "Long Press": toca enquanto o botão estiver pressionado. Desligado ("Single Press"): um toque inicia, outro interrompe. */
  holdToTrigger: boolean;
  loop: boolean;
  /** Do fim do último passo até recomeçar. */
  loopMs: number;
  steps: MacroStep[];
}

export interface BackButton extends KeyMapping {
  macro: Macro;
}

export interface Deadzone {
  enabled: boolean;
  /** Todos em % do curso, 0..100. */
  start: number;
  end: number;
  antiStart: number;
  antiEnd: number;
}

export interface Curve {
  enabled: boolean;
  type: number;
  curvature: number;
  /** 5 pontos (entrada, saída) em 0..255, normalizados entre os limites da deadzone. */
  points: [number, number][];
}

export interface HairTrigger {
  enabled: boolean;
  mode: number;
  start: number;
  end: number;
}

export interface Trigger extends KeyMapping {
  deadzone: Deadzone;
  hairTrigger: HairTrigger;
  curve: Curve;
}

export interface AxisMapping {
  enabled: boolean;
  flipX: boolean;
  flipY: boolean;
  axisRatio: number;
  mouseDpi: number;
  output: number;
  cross: number;
  /** `KeyCode`s usados quando `output` = Keys. */
  up: number;
  down: number;
  left: number;
  right: number;
  outline: number;
}

export interface Stick {
  enabled: boolean;
  /** 0 = radial; diferente de 0 = "Raw". */
  square: number;
  deadzone: Deadzone;
  curve: Curve;
  map: AxisMapping;
}

export interface Motion {
  activation: number;
  activationKey: number;
  /** bit 0 = Roll, bit 1 = Yaw. */
  activeAxis: number;
  deadzone: Deadzone;
  curve: Curve;
  map: AxisMapping;
}

export interface FunData {
  motors: { left: number; right: number; leftTrigger: number; rightTrigger: number };
  audio: { enabled: boolean; volume: number; mixer: number; micMute: number; micSensitivity: number };
  shift: { enabled: boolean; value: number };
  dpadDiagonalLock: boolean;
  xinputAbxySwap: boolean;
  switchAbxySwap: boolean;
  reportRate: number;
  reserved: number[];
}

export interface GameProfile {
  name: string;
  fun: FunData;
  buttons: Record<MappedButton, KeyMapping>;
  L4: BackButton;
  R4: BackButton;
  LT: Trigger;
  RT: Trigger;
  leftStick: Stick;
  rightStick: Stick;
  gyroAim: Motion;
  gyroTilt: Motion;
}

export const GameProfileOffset = {
  Name: 0,
  FunData: 32,
  ReportRate: 46,
  Buttons: 64,
  L4: 176,
  R4: 335,
  LT: 494,
  RT: 522,
  LeftStick: 550,
  RightStick: 582,
  GyroAim: 614,
  GyroTilt: 647,
} as const;

function readFunData(r: ByteReader): FunData {
  return {
    motors: { left: r.u8(), right: r.u8(), leftTrigger: r.u8(), rightTrigger: r.u8() },
    audio: { enabled: r.flag(), volume: r.u8(), mixer: r.u8(), micMute: r.u8(), micSensitivity: r.u8() },
    shift: { enabled: r.flag(), value: r.u8() },
    dpadDiagonalLock: r.flag(),
    xinputAbxySwap: r.flag(),
    switchAbxySwap: r.flag(),
    reportRate: r.u8(),
    reserved: r.bytes(FUN_RESERVED_SIZE),
  };
}

function writeFunData(w: ByteWriter, f: FunData): void {
  w.u8(f.motors.left).u8(f.motors.right).u8(f.motors.leftTrigger).u8(f.motors.rightTrigger);
  w.flag(f.audio.enabled).u8(f.audio.volume).u8(f.audio.mixer).u8(f.audio.micMute).u8(f.audio.micSensitivity);
  w.flag(f.shift.enabled).u8(f.shift.value);
  w.flag(f.dpadDiagonalLock).flag(f.xinputAbxySwap).flag(f.switchAbxySwap).u8(f.reportRate);
  w.bytes(f.reserved, FUN_RESERVED_SIZE);
}

const readTurbo = (r: ByteReader) => ({ turboEnabled: r.flag(), turboSpeed: r.u8() });
const readMap = (r: ByteReader) => ({
  mapEnabled: r.flag(),
  mapTo: [r.u8(), r.u8(), r.u8()] as [number, number, number],
});

function readKeyMapping(r: ByteReader): KeyMapping {
  return { ...readTurbo(r), ...readMap(r), toggle: r.flag() };
}

function writeKeyMapping(w: ByteWriter, k: KeyMapping): void {
  w.flag(k.turboEnabled).u8(k.turboSpeed).flag(k.mapEnabled).bytes(k.mapTo, 3).flag(k.toggle);
}

const MacroFlag = { Enabled: 1, HoldToTrigger: 2, Loop: 4 } as const;

function readMacro(r: ByteReader): Macro {
  const flags = r.u8();
  const loopMs = r.u16be();
  const stepCount = Math.min(r.u8(), MACRO_STEP_COUNT);
  const steps: MacroStep[] = [];
  for (let i = 0; i < MACRO_STEP_COUNT; i++) {
    const key = r.u8();
    const holdMs = r.u16be();
    const delayMs = i < MACRO_STEP_COUNT - 1 ? r.u16be() : 0;
    if (i < stepCount) steps.push({ key, holdMs, delayMs });
  }
  return {
    enabled: (flags & MacroFlag.Enabled) !== 0,
    holdToTrigger: (flags & MacroFlag.HoldToTrigger) !== 0,
    loop: (flags & MacroFlag.Loop) !== 0,
    loopMs,
    steps,
  };
}

function writeMacro(w: ByteWriter, m: Macro): void {
  if (m.steps.length > MACRO_STEP_COUNT) throw new RangeError(`macro com mais de ${MACRO_STEP_COUNT} passos`);
  const flags =
    (m.enabled ? MacroFlag.Enabled : 0) |
    (m.holdToTrigger ? MacroFlag.HoldToTrigger : 0) |
    (m.loop ? MacroFlag.Loop : 0);
  w.u8(flags).u16be(m.loopMs).u8(m.steps.length);
  for (let i = 0; i < MACRO_STEP_COUNT; i++) {
    const step = m.steps[i] ?? { key: 0, holdMs: 0, delayMs: 0 };
    w.u8(step.key).u16be(step.holdMs);
    if (i < MACRO_STEP_COUNT - 1) w.u16be(step.delayMs);
  }
}

function readDeadzone(r: ByteReader): Deadzone {
  return { enabled: r.flag(), start: r.u8(), end: r.u8(), antiStart: r.u8(), antiEnd: r.u8() };
}

function writeDeadzone(w: ByteWriter, d: Deadzone): void {
  w.flag(d.enabled).u8(d.start).u8(d.end).u8(d.antiStart).u8(d.antiEnd);
}

function readCurve(r: ByteReader): Curve {
  const enabled = r.flag();
  const type = r.u8();
  const curvature = r.u8();
  const points = Array.from({ length: CURVE_POINT_COUNT }, () => [r.u8(), r.u8()] as [number, number]);
  return { enabled, type, curvature, points };
}

function writeCurve(w: ByteWriter, c: Curve): void {
  w.flag(c.enabled).u8(c.type).u8(c.curvature);
  for (let i = 0; i < CURVE_POINT_COUNT; i++) w.bytes(c.points[i] ?? [0, 0], 2);
}

const HAIR_TRIGGER_ON = 0x80;
const HAIR_TRIGGER_MODE_MASK = 0x03;

function readTrigger(r: ByteReader): Trigger {
  const turbo = readTurbo(r);
  const deadzone = readDeadzone(r);
  const map = readMap(r);
  const toggle = r.flag();
  const status = r.u8();
  const hairTrigger = {
    enabled: (status & HAIR_TRIGGER_ON) !== 0,
    mode: status & HAIR_TRIGGER_MODE_MASK,
    start: r.u8(),
    end: r.u8(),
  };
  return { ...turbo, deadzone, ...map, toggle, hairTrigger, curve: readCurve(r) };
}

function writeTrigger(w: ByteWriter, t: Trigger): void {
  w.flag(t.turboEnabled).u8(t.turboSpeed);
  writeDeadzone(w, t.deadzone);
  w.flag(t.mapEnabled).bytes(t.mapTo, 3).flag(t.toggle);
  const h = t.hairTrigger;
  w.u8((h.enabled ? HAIR_TRIGGER_ON : 0) | (h.mode & HAIR_TRIGGER_MODE_MASK))
    .u8(h.start)
    .u8(h.end);
  writeCurve(w, t.curve);
}

function readAxisMapping(r: ByteReader): AxisMapping {
  return {
    enabled: r.flag(),
    flipX: r.flag(),
    flipY: r.flag(),
    axisRatio: r.u8(),
    mouseDpi: r.u8(),
    output: r.u8(),
    cross: r.u8(),
    up: r.u8(),
    down: r.u8(),
    left: r.u8(),
    right: r.u8(),
    outline: r.u8(),
  };
}

function writeAxisMapping(w: ByteWriter, m: AxisMapping): void {
  w.flag(m.enabled).flag(m.flipX).flag(m.flipY).u8(m.axisRatio).u8(m.mouseDpi).u8(m.output).u8(m.cross);
  w.u8(m.up).u8(m.down).u8(m.left).u8(m.right).u8(m.outline);
}

function readStick(r: ByteReader): Stick {
  return {
    enabled: r.flag(),
    square: r.u8(),
    deadzone: readDeadzone(r),
    curve: readCurve(r),
    map: readAxisMapping(r),
  };
}

function writeStick(w: ByteWriter, s: Stick): void {
  w.flag(s.enabled).u8(s.square);
  writeDeadzone(w, s.deadzone);
  writeCurve(w, s.curve);
  writeAxisMapping(w, s.map);
}

function readMotion(r: ByteReader): Motion {
  return {
    activation: r.u8(),
    activationKey: r.u8(),
    activeAxis: r.u8(),
    deadzone: readDeadzone(r),
    curve: readCurve(r),
    map: readAxisMapping(r),
  };
}

function writeMotion(w: ByteWriter, m: Motion): void {
  w.u8(m.activation).u8(m.activationKey).u8(m.activeAxis);
  writeDeadzone(w, m.deadzone);
  writeCurve(w, m.curve);
  writeAxisMapping(w, m.map);
}

function readName(r: ByteReader): string {
  const raw = Uint8Array.from(r.bytes(NAME_SIZE));
  const end = raw.indexOf(0);
  return new TextDecoder().decode(end === -1 ? raw : raw.slice(0, end)).trim();
}

function writeName(w: ByteWriter, name: string): void {
  const encoded = new TextEncoder().encode(name);
  if (encoded.length >= NAME_SIZE) throw new RangeError(`nome do perfil com mais de ${NAME_SIZE - 1} bytes`);
  w.bytes(Array.from(encoded), NAME_SIZE);
}

export function decodeGameProfile(bytes: ArrayLike<number>): GameProfile {
  if (bytes.length !== GAME_PROFILE_SIZE) throw new RangeError(`perfil de jogo tem ${GAME_PROFILE_SIZE} bytes`);
  const r = new ByteReader(Uint8Array.from(bytes));
  const name = readName(r);
  const fun = readFunData(r);
  const buttons = {} as Record<MappedButton, KeyMapping>;
  for (const button of MAPPED_BUTTONS) buttons[button] = readKeyMapping(r);
  return {
    name,
    fun,
    buttons,
    L4: { ...readKeyMapping(r), macro: readMacro(r) },
    R4: { ...readKeyMapping(r), macro: readMacro(r) },
    LT: readTrigger(r),
    RT: readTrigger(r),
    leftStick: readStick(r),
    rightStick: readStick(r),
    gyroAim: readMotion(r),
    gyroTilt: readMotion(r),
  };
}

export function encodeGameProfile(p: GameProfile): Uint8Array {
  const w = new ByteWriter();
  writeName(w, p.name);
  writeFunData(w, p.fun);
  for (const button of MAPPED_BUTTONS) writeKeyMapping(w, p.buttons[button]);
  for (const back of [p.L4, p.R4]) {
    writeKeyMapping(w, back);
    writeMacro(w, back.macro);
  }
  writeTrigger(w, p.LT);
  writeTrigger(w, p.RT);
  writeStick(w, p.leftStick);
  writeStick(w, p.rightStick);
  writeMotion(w, p.gyroAim);
  writeMotion(w, p.gyroTilt);
  const out = w.toBytes();
  if (out.length !== GAME_PROFILE_SIZE) throw new Error(`perfil codificado com ${out.length} bytes`);
  return out;
}
