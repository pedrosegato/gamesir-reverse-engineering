/**
 * Perfil de luz (perfil 32, 635 bytes). Codec `Ks` do main.js
 * (`fromBytes`/`fromModel`, helpers `re`/`ne`/`Q`/`Z`/`te`).
 *
 *   0          ConfigIndex: qual das animações está ativa (o app limita a 0..3)
 *   1..620     5 animações × 124 bytes
 *                +0 KeyFrameCount   quantos frames a animação usa (1..8)
 *                +1 EffectCount     o app sempre grava 5
 *                +2 speed byte      = 20 - Speed (Speed 0..20 na UI; byte 0 = mais rápido)
 *                +3 Brightness      0..100
 *                +4 8 frames × 5 LEDs × RGB (15 bytes por frame)
 *   621..634   trailer de 14 bytes
 *                +0 bit0 AudioReactiveMode
 *                +1 UserEffectIndex
 *                +2..4 ProfileLed (R, G, B)
 *                +5 bit0 RaiseWakeUp
 *                +6 StandbyTime
 *                +7..13 reservado
 */

import { BLACK, type ColorInput, type Rgb, toRgb } from "./color.js";
import { LIGHT_PROFILE_SIZE } from "./constants.js";

export const ANIMATION_COUNT = 5;
export const FRAME_COUNT = 8;
export const LEDS_PER_FRAME = 5;
export const ANIMATION_SIZE = 4 + FRAME_COUNT * LEDS_PER_FRAME * 3; // 124
export const MAX_SPEED = 20;

/** 5 cores, uma por LED, na ordem RGB0..RGB4 do app. */
export type Frame = Rgb[];

export interface Animation {
  keyFrameCount: number;
  effectCount: number;
  /** 0..20, como na UI do app (maior = mais rápido). */
  speed: number;
  /** 0..100 */
  brightness: number;
  /** Sempre 8 frames de 5 cores. Só os primeiros `keyFrameCount` são tocados. */
  frames: Frame[];
}

export interface LightProfile {
  configIndex: number;
  animations: Animation[];
  audioReactiveMode: boolean;
  userEffectIndex: number;
  profileLed: Rgb;
  raiseWakeUp: boolean;
  standbyTime: number;
  reserved: number[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** speed da UI (0..20) → byte do perfil. Função `te(e, false)`. */
export const encodeSpeed = (speed: number) => clamp(Math.abs(clamp(speed, 0, Infinity) - MAX_SPEED), 0, MAX_SPEED);
/** byte do perfil → speed da UI. Função `te(e, true)`. */
export const decodeSpeed = (byte: number) => clamp(MAX_SPEED - Math.min(byte, MAX_SPEED), 0, MAX_SPEED);

export function emptyFrame(): Frame {
  return Array.from({ length: LEDS_PER_FRAME }, () => ({ ...BLACK }));
}

export function makeAnimation(frames: ColorInput[][], opts: { speed?: number; brightness?: number } = {}): Animation {
  if (frames.length < 1 || frames.length > FRAME_COUNT) throw new RangeError(`1..${FRAME_COUNT} frames`);
  const full: Frame[] = frames.map((f) => {
    if (f.length !== LEDS_PER_FRAME) throw new RangeError(`cada frame precisa de ${LEDS_PER_FRAME} cores`);
    return f.map(toRgb);
  });
  while (full.length < FRAME_COUNT) full.push(emptyFrame());
  return {
    keyFrameCount: frames.length,
    effectCount: LEDS_PER_FRAME,
    speed: opts.speed ?? 10,
    brightness: opts.brightness ?? 100,
    frames: full,
  };
}

export function decodeLightProfile(bytes: ArrayLike<number>): LightProfile {
  if (bytes.length !== LIGHT_PROFILE_SIZE) throw new RangeError(`perfil de luz tem ${LIGHT_PROFILE_SIZE} bytes`);
  const b = Array.from(bytes);
  let configIndex = b[0];
  if (configIndex > 3) configIndex = 0; // mesmo saneamento do app
  const animations: Animation[] = [];
  for (let a = 0; a < ANIMATION_COUNT; a++) {
    const base = 1 + a * ANIMATION_SIZE;
    const frames: Frame[] = [];
    for (let f = 0; f < FRAME_COUNT; f++) {
      const fo = base + 4 + f * LEDS_PER_FRAME * 3;
      frames.push(
        Array.from({ length: LEDS_PER_FRAME }, (_, l) => ({
          r: b[fo + l * 3],
          g: b[fo + l * 3 + 1],
          b: b[fo + l * 3 + 2],
        })),
      );
    }
    animations.push({
      keyFrameCount: b[base],
      effectCount: b[base + 1],
      speed: decodeSpeed(b[base + 2]),
      brightness: Math.min(b[base + 3], 100),
      frames,
    });
  }
  const t = 1 + ANIMATION_COUNT * ANIMATION_SIZE;
  return {
    configIndex,
    animations,
    audioReactiveMode: (b[t] & 1) !== 0,
    userEffectIndex: b[t + 1],
    profileLed: { r: b[t + 2], g: b[t + 3], b: b[t + 4] },
    raiseWakeUp: (b[t + 5] & 1) !== 0,
    standbyTime: b[t + 6],
    reserved: b.slice(t + 7, t + 14),
  };
}

export function encodeLightProfile(p: LightProfile): Uint8Array {
  if (p.animations.length !== ANIMATION_COUNT) throw new RangeError(`${ANIMATION_COUNT} animações`);
  const out: number[] = [p.configIndex];
  for (const a of p.animations) {
    out.push(a.keyFrameCount, a.effectCount, encodeSpeed(a.speed), clamp(a.brightness, 0, 100));
    for (let f = 0; f < FRAME_COUNT; f++) {
      const frame = a.frames[f] ?? emptyFrame();
      for (let l = 0; l < LEDS_PER_FRAME; l++) {
        const c = frame[l] ?? BLACK;
        out.push(c.r, c.g, c.b);
      }
    }
  }
  const reserved = [...p.reserved, 0, 0, 0, 0, 0, 0, 0].slice(0, 7);
  out.push(
    p.audioReactiveMode ? 1 : 0,
    p.userEffectIndex,
    p.profileLed.r,
    p.profileLed.g,
    p.profileLed.b,
    p.raiseWakeUp ? 1 : 0,
    p.standbyTime,
    ...reserved,
  );
  return Uint8Array.from(out);
}

/** Primeiro e último índice que diferem (`go.bytesDiff`). null se iguais. */
export function diffRange(a: ArrayLike<number>, b: ArrayLike<number>): { start: number; end: number } | null {
  if (a.length !== b.length || a.length === 0) return { start: 0, end: b.length - 1 };
  let start = -1;
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) {
      start = i;
      break;
    }
  if (start === -1) return null;
  let end = start;
  for (let i = a.length - 1; i >= start; i--)
    if (a[i] !== b[i]) {
      end = i;
      break;
    }
  return { start, end };
}
