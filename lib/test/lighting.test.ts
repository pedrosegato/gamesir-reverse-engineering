import { describe, expect, it } from "vitest";
import {
  animation,
  applyPreset,
  decodeLightProfile,
  decodeSpeed,
  diffRange,
  encodeLightProfile,
  encodeSpeed,
  FRAME_ZONE_ORDER,
  LIGHT_PROFILE_SIZE,
  LightOffset,
  PRESETS,
} from "../src/index.js";

function handBuiltProfile(slot: number, r: number, g: number, b: number): number[] {
  const anim = [1, 5, 0, 100];
  for (let i = 0; i < 5; i++) anim.push(...(i === slot ? [r, g, b] : [0, 0, 0]));
  for (let i = 0; i < 7; i++) anim.push(...new Array(15).fill(0));
  const profile = [0];
  for (let i = 0; i < 5; i++) profile.push(...anim);
  profile.push(0, 0, r, g, b, 1, 10, 0, 0, 0, 0, 0, 0, 0);
  return profile;
}

describe("perfil de luz", () => {
  it("tem 635 bytes, igual ao montado à mão", () => {
    expect(handBuiltProfile(0, 1, 2, 3)).toHaveLength(LIGHT_PROFILE_SIZE);
  });

  it("slot 3 do frame é o Home, como o script de bateria usa", () => {
    expect(FRAME_ZONE_ORDER[3]).toBe("Home");
    const p = decodeLightProfile(handBuiltProfile(3, 255, 128, 0));
    expect(p.animations[0].frames[0].Home).toEqual({ r: 255, g: 128, b: 0 });
    expect(p.animations[0].frames[0].LowerLeft).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("decodifica cabeçalho e trailer", () => {
    const p = decodeLightProfile(handBuiltProfile(0, 9, 9, 9));
    const a = p.animations[0];
    expect(p.activeAnimation).toBe(0);
    expect(a.keyFrameCount).toBe(1);
    expect(a.effectCount).toBe(5);
    expect(a.speed).toBe(20);
    expect(a.brightness).toBe(100);
    expect(p.profileLed).toEqual({ r: 9, g: 9, b: 9 });
    expect(p.raiseWakeUp).toBe(true);
    expect(p.standbyTime).toBe(10);
    expect(p.audioReactiveMode).toBe(false);
  });

  it("ida e volta preserva os bytes", () => {
    const bytes = handBuiltProfile(1, 10, 20, 30);
    bytes[LightOffset.ConfigIndex] = 2;
    bytes[LightOffset.animation(1) + 2] = 7;
    bytes[LightOffset.Reserved + 3] = 0xaa;
    expect(Array.from(encodeLightProfile(decodeLightProfile(bytes)))).toEqual(bytes);
  });

  it("velocidade gravada invertida", () => {
    expect(encodeSpeed(20)).toBe(0);
    expect(encodeSpeed(0)).toBe(20);
    expect(encodeSpeed(17)).toBe(3);
    expect(decodeSpeed(3)).toBe(17);
    expect(decodeSpeed(255)).toBe(0);
  });

  it("diff encontra só o trecho alterado", () => {
    const a = handBuiltProfile(0, 1, 1, 1);
    const b = a.slice();
    b[10] = 99;
    b[20] = 99;
    expect(diffRange(a, b)).toEqual({ start: 10, end: 20 });
    expect(diffRange(a, a.slice())).toBeNull();
  });
});

describe("presets", () => {
  it("Flow gera os bytes do app (frame 0: LL LR UL Home UR)", () => {
    const profile = decodeLightProfile(handBuiltProfile(0, 0, 0, 0));
    profile.animations[0] = applyPreset(animation([{}]), "Flow");
    const bytes = encodeLightProfile(profile);
    const start = LightOffset.animation(0);
    expect(Array.from(bytes.slice(start, start + 4))).toEqual([5, 5, 3, 100]);
    const frame0 = Buffer.from(bytes.slice(start + 4, start + 19)).toString("hex");
    expect(frame0).toBe("00ff00ffff000000ffff0000ff0000");
  });

  it("mantém brilho e effectCount, preenche o resto com preto", () => {
    const alarm = applyPreset(animation([{ Home: "#ffffff" }], { brightness: 40 }), "Alarm");
    expect(alarm.brightness).toBe(40);
    expect(alarm.effectCount).toBe(5);
    expect(alarm.keyFrameCount).toBe(PRESETS.Alarm.frames.length);
    expect(alarm.frames[7].Home).toEqual({ r: 0, g: 0, b: 0 });
  });
});
