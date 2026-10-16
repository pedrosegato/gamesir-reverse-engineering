import { BLACK, type ColorInput, type Rgb, toRgb } from "./color.js";
import { type LedZone, LIGHT_PROFILE_SIZE } from "./constants.js";

export const ANIMATION_COUNT = 5;
export const USER_ANIMATION_COUNT = 4;
export const CHARGING_ANIMATION = 4;
export const FRAME_COUNT = 8;
export const MAX_SPEED = 20;
export const MAX_BRIGHTNESS = 100;
export const STANDBY_MINUTES = [0, 1, 5, 10, 20] as const;

/** Difere da ordem do report de estado (`LED_ZONES`). */
export const FRAME_ZONE_ORDER = [
  "LowerLeft",
  "LowerRight",
  "UpperLeft",
  "Home",
  "UpperRight",
] as const satisfies readonly LedZone[];

const ZONE_COUNT = FRAME_ZONE_ORDER.length;
const FRAME_SIZE = ZONE_COUNT * 3;
const ANIMATION_HEADER_SIZE = 4;
const ANIMATION_SIZE = ANIMATION_HEADER_SIZE + FRAME_COUNT * FRAME_SIZE;
const TRAILER_OFFSET = 1 + ANIMATION_COUNT * ANIMATION_SIZE;
const RESERVED_SIZE = 7;

export const LightOffset = {
  ConfigIndex: 0,
  animation: (index: number) => 1 + index * ANIMATION_SIZE,
  AudioReactiveMode: TRAILER_OFFSET,
  UserEffectIndex: TRAILER_OFFSET + 1,
  ProfileLed: TRAILER_OFFSET + 2,
  RaiseWakeUp: TRAILER_OFFSET + 5,
  StandbyTime: TRAILER_OFFSET + 6,
  Reserved: TRAILER_OFFSET + 7,
} as const;

/** No Cyclone 2: LowerLeft/LowerRight = laterais, Home = botão Home, UpperRight = LED do centro, UpperLeft = sem LED. */
export type Frame = Record<LedZone, Rgb>;
export type FrameInput = Partial<Record<LedZone, ColorInput>>;

export interface Animation {
  keyFrameCount: number;
  /** Sempre 5; o app nunca altera. */
  effectCount: number;
  /** 0..20, maior = mais rápido. */
  speed: number;
  brightness: number;
  frames: Frame[];
}

export interface LightProfile {
  activeAnimation: number;
  animations: Animation[];
  audioReactiveMode: boolean;
  userEffectIndex: number;
  profileLed: Rgb;
  raiseWakeUp: boolean;
  /** Minutos; 0 = nunca dorme. */
  standbyTime: number;
  reserved: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const encodeSpeed = (speed: number) => MAX_SPEED - clamp(speed, 0, MAX_SPEED);
export const decodeSpeed = (byte: number) => MAX_SPEED - Math.min(byte, MAX_SPEED);

export function frame(colors: FrameInput = {}): Frame {
  const out = {} as Frame;
  for (const zone of FRAME_ZONE_ORDER) {
    const color = colors[zone];
    out[zone] = color === undefined ? { ...BLACK } : toRgb(color);
  }
  return out;
}

export const solidFrame = (color: ColorInput): Frame =>
  frame(Object.fromEntries(FRAME_ZONE_ORDER.map((zone) => [zone, color])));

export function animation(
  frames: FrameInput[],
  { speed = 10, brightness = MAX_BRIGHTNESS, effectCount = 5 } = {},
): Animation {
  if (frames.length < 1 || frames.length > FRAME_COUNT) {
    throw new RangeError(`animação precisa de 1..${FRAME_COUNT} frames`);
  }
  const full = frames.map(frame);
  while (full.length < FRAME_COUNT) full.push(frame());
  return { keyFrameCount: frames.length, effectCount, speed, brightness, frames: full };
}

export function decodeLightProfile(bytes: ArrayLike<number>): LightProfile {
  if (bytes.length !== LIGHT_PROFILE_SIZE) throw new RangeError(`perfil de luz tem ${LIGHT_PROFILE_SIZE} bytes`);
  const b = Uint8Array.from(bytes);
  const rgbAt = (o: number): Rgb => ({ r: b[o], g: b[o + 1], b: b[o + 2] });

  const animations: Animation[] = [];
  for (let a = 0; a < ANIMATION_COUNT; a++) {
    const base = LightOffset.animation(a);
    const frames: Frame[] = [];
    for (let f = 0; f < FRAME_COUNT; f++) {
      const frameBase = base + ANIMATION_HEADER_SIZE + f * FRAME_SIZE;
      const fr = {} as Frame;
      FRAME_ZONE_ORDER.forEach((zone, i) => {
        fr[zone] = rgbAt(frameBase + i * 3);
      });
      frames.push(fr);
    }
    animations.push({
      keyFrameCount: b[base],
      effectCount: b[base + 1],
      speed: decodeSpeed(b[base + 2]),
      brightness: Math.min(b[base + 3], MAX_BRIGHTNESS),
      frames,
    });
  }

  return {
    activeAnimation: b[LightOffset.ConfigIndex],
    animations,
    audioReactiveMode: (b[LightOffset.AudioReactiveMode] & 1) === 1,
    userEffectIndex: b[LightOffset.UserEffectIndex],
    profileLed: rgbAt(LightOffset.ProfileLed),
    raiseWakeUp: (b[LightOffset.RaiseWakeUp] & 1) === 1,
    standbyTime: b[LightOffset.StandbyTime],
    reserved: Array.from(b.slice(LightOffset.Reserved, LightOffset.Reserved + RESERVED_SIZE)),
  };
}

export function encodeLightProfile(p: LightProfile): Uint8Array {
  if (p.animations.length !== ANIMATION_COUNT) throw new RangeError(`perfil de luz tem ${ANIMATION_COUNT} animações`);
  const out = new Uint8Array(LIGHT_PROFILE_SIZE);
  const putRgb = (o: number, c: Rgb) => out.set([c.r, c.g, c.b], o);

  out[LightOffset.ConfigIndex] = p.activeAnimation;
  p.animations.forEach((a, index) => {
    const base = LightOffset.animation(index);
    out.set([a.keyFrameCount, a.effectCount, encodeSpeed(a.speed), clamp(a.brightness, 0, MAX_BRIGHTNESS)], base);
    for (let f = 0; f < FRAME_COUNT; f++) {
      const fr = a.frames[f] ?? frame();
      FRAME_ZONE_ORDER.forEach((zone, i) => {
        putRgb(base + ANIMATION_HEADER_SIZE + f * FRAME_SIZE + i * 3, fr[zone] ?? BLACK);
      });
    }
  });

  out[LightOffset.AudioReactiveMode] = p.audioReactiveMode ? 1 : 0;
  out[LightOffset.UserEffectIndex] = p.userEffectIndex;
  putRgb(LightOffset.ProfileLed, p.profileLed);
  out[LightOffset.RaiseWakeUp] = p.raiseWakeUp ? 1 : 0;
  out[LightOffset.StandbyTime] = p.standbyTime;
  out.set(p.reserved.slice(0, RESERVED_SIZE), LightOffset.Reserved);
  return out;
}

export function diffRange(a: ArrayLike<number>, b: ArrayLike<number>): { start: number; end: number } | null {
  if (a.length !== b.length || a.length === 0) return { start: 0, end: b.length - 1 };
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  if (start === a.length) return null;
  let end = a.length - 1;
  while (a[end] === b[end]) end--;
  return { start, end };
}
