import { type Animation, animation, type ColorInput, type FrameInput, type LedZone } from "gamesir-hid";
import type { IndicatorKey } from "./status.js";

export interface Indicator {
  readonly label: string;
  readonly icon: string;
  readonly animation: Animation;
}

export type Indicators = Readonly<Record<IndicatorKey, Indicator>>;

const CHARGING_COLORS = ["#ff0000", "#ff9600", "#ffff00", "#00ff00", "#0096ff", "#b400ff"] as const;

function frames(zone: LedZone, ...colors: ColorInput[]): FrameInput[] {
  return colors.map((color) => {
    const frame: FrameInput = {};
    frame[zone] = color;
    return frame;
  });
}

export function indicatorsFor(zone: LedZone): Indicators {
  return {
    charged: { label: "carregada", icon: "#ffffff", animation: animation(frames(zone, "#ffffff")) },
    charging: {
      label: "carregando",
      icon: "#0096ff",
      animation: animation(frames(zone, ...CHARGING_COLORS), { speed: 12 }),
    },
    critical: {
      label: "crítica",
      icon: "#ff0000",
      animation: animation(frames(zone, "#ff0000", "#000000"), { speed: 18 }),
    },
    low: { label: "baixa", icon: "#ff0000", animation: animation(frames(zone, "#ff0000")) },
    medium: { label: "média", icon: "#ffb400", animation: animation(frames(zone, "#ffb400")) },
    good: { label: "boa", icon: "#50ff00", animation: animation(frames(zone, "#50ff00")) },
    high: { label: "alta", icon: "#00ff00", animation: animation(frames(zone, "#00ff00")) },
  };
}
