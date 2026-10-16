import { type Animation, animation, type ColorInput, type FrameInput, type LedZone } from "../../src/index.js";
import type { IndicatorKey } from "./status.js";

export interface Indicator {
  readonly label: string;
  readonly animation: Animation;
}

const CHARGING_COLORS = ["#ff0000", "#ff9600", "#ffff00", "#00ff00", "#0096ff", "#b400ff"] as const;

/** Um frame por cor, acendendo só `zone`; as outras zonas ficam apagadas. */
function frames(zone: LedZone, ...colors: ColorInput[]): FrameInput[] {
  return colors.map((color) => {
    const frame: FrameInput = {};
    frame[zone] = color;
    return frame;
  });
}

export function indicatorsFor(zone: LedZone) {
  return {
    charged: { label: "carregada", animation: animation(frames(zone, "#ffffff")) },
    charging: { label: "carregando", animation: animation(frames(zone, ...CHARGING_COLORS), { speed: 12 }) },
    critical: { label: "crítica", animation: animation(frames(zone, "#ff0000", "#000000"), { speed: 18 }) },
    low: { label: "baixa", animation: animation(frames(zone, "#ff0000")) },
    medium: { label: "média", animation: animation(frames(zone, "#ffb400")) },
    good: { label: "boa", animation: animation(frames(zone, "#50ff00")) },
    high: { label: "alta", animation: animation(frames(zone, "#00ff00")) },
  } satisfies Record<IndicatorKey, Indicator>;
}
