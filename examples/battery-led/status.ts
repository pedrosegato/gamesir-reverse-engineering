export const LEVELS = [
  { name: "critical", upTo: 9 },
  { name: "low", upTo: 25 },
  { name: "medium", upTo: 50 },
  { name: "good", upTo: 75 },
  { name: "high", upTo: 100 },
] as const satisfies readonly { name: string; upTo: number }[];

export type Level = (typeof LEVELS)[number]["name"];

/** A leitura oscila ±1 % perto das bordas. */
export const HYSTERESIS = 2;

export interface BatterySample {
  readonly percent: number;
  readonly charging: boolean;
}

export type BatteryStatus =
  | { readonly kind: "charged" }
  | { readonly kind: "charging"; readonly percent: number }
  | { readonly kind: "discharging"; readonly percent: number; readonly level: Level };

export type IndicatorKey = Exclude<BatteryStatus["kind"], "discharging"> | Level;

export const indicatorKey = (status: BatteryStatus): IndicatorKey =>
  status.kind === "discharging" ? status.level : status.kind;

const levelIndex = (level: Level) => LEVELS.findIndex((l) => l.name === level);

function levelFor(percent: number, previous?: Level): Level {
  const candidate = LEVELS.find((l) => percent <= l.upTo)?.name ?? "high";
  if (previous === undefined || candidate === previous) return candidate;

  const i = levelIndex(previous);
  const floor = i === 0 ? Number.NEGATIVE_INFINITY : LEVELS[i - 1].upTo;
  const ceiling = LEVELS[i].upTo;
  const stillInside = percent > floor - HYSTERESIS && percent <= ceiling + HYSTERESIS;
  return stillInside ? previous : candidate;
}

export function classify({ percent, charging }: BatterySample, previous?: BatteryStatus): BatteryStatus {
  if (charging) return percent >= 100 ? { kind: "charged" } : { kind: "charging", percent };
  const previousLevel = previous?.kind === "discharging" ? previous.level : undefined;
  return { kind: "discharging", percent, level: levelFor(percent, previousLevel) };
}
