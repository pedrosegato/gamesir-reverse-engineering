import { type Animation, FRAME_COUNT, type FrameInput, frame } from "./lighting.js";

const same = (c: string): FrameInput => ({ Home: c, UpperLeft: c, LowerLeft: c, LowerRight: c, UpperRight: c });

/** Presets da tela de luzes do GameSir Connect, com as cores e velocidades originais. */
export const PRESETS = {
  Flow: {
    speed: 17,
    frames: [
      { Home: "#FF0000", UpperLeft: "#0000FF", LowerLeft: "#00FF00", LowerRight: "#FFFF00", UpperRight: "#FF0000" },
      { Home: "#FF8000", UpperLeft: "#FF0000", LowerLeft: "#0000FF", LowerRight: "#00FF80", UpperRight: "#FFFF00" },
      { Home: "#FFFF00", UpperLeft: "#FF80FF", LowerLeft: "#800080", LowerRight: "#0000FF", UpperRight: "#00FF00" },
      { Home: "#14FF01", UpperLeft: "#808000", LowerLeft: "#FF0000", LowerRight: "#FF0000", UpperRight: "#0000FF" },
      { Home: "#000FFF", UpperLeft: "#008000", LowerLeft: "#FF0000", LowerRight: "#808000", UpperRight: "#FF0080" },
    ],
  },
  Rainbow: {
    speed: 10,
    frames: ["#FF0000", "#FFA500", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF", "#FF0000"].map(same),
  },
  Pulse: {
    speed: 5,
    frames: [
      { Home: "#FF00C8", UpperLeft: "#FF0000", LowerLeft: "#8000FF", LowerRight: "#8000FF", UpperRight: "#FF0000" },
      { Home: "#0080FF", UpperLeft: "#000000", LowerLeft: "#0080FF", LowerRight: "#0080FF", UpperRight: "#000000" },
    ],
  },
  Standoff: {
    speed: 10,
    frames: [
      { Home: "#FFFFFF", UpperLeft: "#00B3FF", LowerLeft: "#0040FF", LowerRight: "#FF0500", UpperRight: "#FF0500" },
    ],
  },
  Alarm: {
    speed: 18,
    frames: ["#FF0000", "#000000", "#FF0000", "#000000", "#000000", "#000000"].map(same),
  },
  Off: {
    speed: 10,
    frames: [same("#000000")],
  },
} satisfies Record<string, { speed: number; frames: FrameInput[] }>;

export type PresetName = keyof typeof PRESETS;

/** Igual ao `applyPreset` do app: troca velocidade e frames, mantém brilho e effectCount. */
export function applyPreset(target: Animation, name: PresetName): Animation {
  const preset = PRESETS[name];
  return {
    ...target,
    speed: preset.speed,
    keyFrameCount: preset.frames.length,
    frames: Array.from({ length: FRAME_COUNT }, (_, i) => frame(preset.frames[i])),
  };
}
