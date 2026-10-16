import { parseArgs } from "node:util";
import { LED_ZONES, type LedZone, USER_ANIMATION_COUNT } from "gamesir-hid";
import { indicatorsFor } from "./indicators.js";
import { describeUpdate } from "./messages.js";
import { BatteryMonitor } from "./monitor.js";
import { isProposal, PROPOSALS, runPreview } from "./preview.js";
import type { IndicatorKey } from "./status.js";

interface Options {
  readonly slot: number;
  readonly zone: LedZone;
  readonly preview?: IndicatorKey;
}

const isLedZone = (value: string): value is LedZone => (LED_ZONES as readonly string[]).includes(value);

function parseOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: {
      slot: { type: "string", default: "4" },
      zone: { type: "string", default: "Home" },
      preview: { type: "string" },
    },
  });
  const slot = Number(values.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > USER_ANIMATION_COUNT) {
    throw new Error(`--slot must be 1 to ${USER_ANIMATION_COUNT}`);
  }
  const zone = values.zone ?? "Home";
  if (!isLedZone(zone)) throw new Error(`--zone must be one of ${LED_ZONES.join(", ")}`);
  const { preview } = values;
  if (preview !== undefined && !isProposal(preview)) {
    throw new Error(`--preview must be one of ${Object.keys(PROPOSALS).join(", ")}`);
  }
  return { slot: slot - 1, zone, preview };
}

const options = parseOptions(process.argv.slice(2));
const indicators = indicatorsFor(options.zone);
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());

if (options.preview) {
  console.log(`prévia: ${indicators[options.preview].label}. Ctrl+C devolve a luz original.`);
  await runPreview(options.preview, stop.signal);
} else {
  let previous = "";
  const monitor = new BatteryMonitor({
    slot: options.slot,
    indicators,
    onUpdate: (update) => {
      const line = describeUpdate(update, indicators);
      if (line === previous) return;
      previous = line;
      console.log(`${new Date().toLocaleTimeString("pt-BR")}  ${line}`);
    },
  });
  await monitor.run(stop.signal);
}
