import { type Animation, animation } from "gamesir-hid";
import type { IndicatorKey } from "./status.js";

/**
 * The controller loops its frames, all equally long, so blinks followed by a long pause are stepped by the app:
 * each frame index in `frames` is shown for `stepMs`, the last one for `holdMs`.
 */
export interface Steps {
  readonly frames: readonly number[];
  readonly stepMs: number;
  readonly holdMs: number;
}

export interface Indicator {
  readonly label: string;
  readonly icon: string;
  readonly animation: Animation;
  readonly steps?: Steps;
}

export type Indicators = Readonly<Record<IndicatorKey, Indicator>>;

const CHARGING_COLORS = ["#ff0000", "#ff9600", "#ffff00", "#00ff00", "#0096ff", "#b400ff"] as const;

const solid = (label: string, color: string): Indicator => ({
  label,
  icon: color,
  animation: animation([{ Home: color }]),
});

/** Turn signal: "click" lights Home and the left side, "clack" the right side, three times; then Home stays lit. */
const alert = (label: string, color: string): Indicator => ({
  label,
  icon: color,
  animation: animation([{ Home: color, LowerLeft: color }, { LowerRight: color }, { Home: color }]),
  steps: { frames: [0, 1, 0, 1, 0, 1, 2], stepMs: 500, holdMs: 12_000 },
});

export const INDICATORS: Indicators = {
  charged: alert("carregada", "#ffffff"),
  charging: {
    label: "carregando",
    icon: "#0096ff",
    animation: animation(
      CHARGING_COLORS.map((Home) => ({ Home })),
      { speed: 12 },
    ),
  },
  critical: alert("crítica", "#ff0000"),
  low: solid("baixa", "#ff0000"),
  medium: solid("média", "#ffcc00"),
  good: solid("boa", "#a0ff00"),
  high: solid("alta", "#00a000"),
};
