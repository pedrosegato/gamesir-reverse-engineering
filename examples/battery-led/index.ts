import { parseArgs } from "node:util";
import { USER_ANIMATION_COUNT } from "gamesir-hid";
import { INDICATORS } from "./indicators.js";
import { describeUpdate } from "./messages.js";
import { BatteryMonitor } from "./monitor.js";
import { isIndicatorKey, runPreview } from "./preview.js";
import type { IndicatorKey } from "./status.js";

interface Options {
  readonly slot: number;
  readonly preview?: IndicatorKey;
}

function parseOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: {
      slot: { type: "string", default: "4" },
      preview: { type: "string" },
    },
  });
  const slot = Number(values.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > USER_ANIMATION_COUNT) {
    throw new Error(`--slot must be 1 to ${USER_ANIMATION_COUNT}`);
  }
  const { preview } = values;
  if (preview !== undefined && !isIndicatorKey(preview)) {
    throw new Error(`--preview must be one of ${Object.keys(INDICATORS).join(", ")}`);
  }
  return { slot: slot - 1, preview };
}

const options = parseOptions(process.argv.slice(2));
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());

if (options.preview) {
  console.log(`prévia: ${INDICATORS[options.preview].label}. Ctrl+C devolve a luz original.`);
  await runPreview(options.preview, options.slot, stop.signal);
} else {
  let previous = "";
  const monitor = new BatteryMonitor({
    slot: options.slot,
    indicators: INDICATORS,
    onUpdate: (update) => {
      const line = describeUpdate(update, INDICATORS);
      if (line === previous) return;
      previous = line;
      console.log(`${new Date().toLocaleTimeString("pt-BR")}  ${line}`);
    },
  });
  await monitor.run(stop.signal);
}
