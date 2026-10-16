import { describe, expect, it } from "vitest";
import {
  decodeLightProfile,
  decodeSpeed,
  diffRange,
  encodeLightProfile,
  encodeSpeed,
  LIGHT_PROFILE_SIZE,
} from "../src/index.js";

/** Mesmo perfil que `generate_light_profile()` de example-scripts/debug_led_cyclone.py monta. */
function pythonScriptProfile(slot: number, r: number, g: number, b: number): number[] {
  const anim = [1, 5, 0, 100];
  for (let i = 0; i < 5; i++) anim.push(...(i === slot ? [r, g, b] : [0, 0, 0]));
  for (let i = 0; i < 7; i++) anim.push(...new Array(15).fill(0));
  const profile = [0];
  for (let i = 0; i < 5; i++) profile.push(...anim);
  profile.push(0, 0, r, g, b, 1, 10, 0, 0, 0, 0, 0, 0, 0);
  return profile;
}

describe("perfil de luz", () => {
  it("tem 635 bytes no formato dos scripts de teste", () => {
    expect(pythonScriptProfile(0, 1, 2, 3)).toHaveLength(LIGHT_PROFILE_SIZE);
  });

  it("decodifica os campos", () => {
    const p = decodeLightProfile(pythonScriptProfile(3, 255, 128, 0));
    expect(p.configIndex).toBe(0);
    expect(p.animations).toHaveLength(5);
    const a = p.animations[0];
    expect(a.keyFrameCount).toBe(1);
    expect(a.effectCount).toBe(5);
    expect(a.speed).toBe(20); // byte 0 = velocidade máxima
    expect(a.brightness).toBe(100);
    expect(a.frames[0][3]).toEqual({ r: 255, g: 128, b: 0 });
    expect(a.frames[0][0]).toEqual({ r: 0, g: 0, b: 0 });
    expect(p.profileLed).toEqual({ r: 255, g: 128, b: 0 });
    expect(p.raiseWakeUp).toBe(true);
    expect(p.standbyTime).toBe(10);
    expect(p.audioReactiveMode).toBe(false);
  });

  it("ida e volta preserva os bytes", () => {
    const bytes = pythonScriptProfile(1, 10, 20, 30);
    bytes[0] = 2;
    bytes[1 + 124 + 2] = 7; // speed byte da animação 1
    expect(Array.from(encodeLightProfile(decodeLightProfile(bytes)))).toEqual(bytes);
  });

  it("velocidade invertida como em te()", () => {
    expect(encodeSpeed(20)).toBe(0);
    expect(encodeSpeed(0)).toBe(20);
    expect(encodeSpeed(8)).toBe(12);
    expect(decodeSpeed(12)).toBe(8);
    expect(decodeSpeed(255)).toBe(0);
  });

  it("diff encontra só o trecho alterado", () => {
    const a = pythonScriptProfile(0, 1, 1, 1);
    const b = a.slice();
    b[10] = 99;
    b[20] = 99;
    expect(diffRange(a, b)).toEqual({ start: 10, end: 20 });
    expect(diffRange(a, a.slice())).toBeNull();
  });
});
