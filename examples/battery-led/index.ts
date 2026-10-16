import { parseArgs } from "node:util";
import { LED_ZONES, type LedZone, USER_ANIMATION_COUNT } from "gamesir-hid";
import { indicatorsFor } from "./indicators.js";
import { describeUpdate } from "./messages.js";
import { BatteryMonitor } from "./monitor.js";

interface Options {
  readonly slot: number;
  readonly zone: LedZone;
}

const isLedZone = (value: string): value is LedZone => (LED_ZONES as readonly string[]).includes(value);

function parseOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: { slot: { type: "string", default: "4" }, zone: { type: "string", default: "Home" } },
  });
  const slot = Number(values.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > USER_ANIMATION_COUNT) {
    throw new Error(`--slot must be 1 to ${USER_ANIMATION_COUNT}`);
  }
  const zone = values.zone ?? "Home";
  if (!isLedZone(zone)) throw new Error(`--zone must be one of ${LED_ZONES.join(", ")}`);
  return { slot: slot - 1, zone };
}

const options = parseOptions(process.argv.slice(2));
const indicators = indicatorsFor(options.zone);

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

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());
await monitor.run(stop.signal);
