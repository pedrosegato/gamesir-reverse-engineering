import { INDICATOR_SLOT, INDICATORS } from "./indicators.js";
import { describeUpdate } from "./messages.js";
import { BatteryMonitor } from "./monitor.js";
import { isIndicatorKey, runPreview } from "./preview.js";

const [command, key] = process.argv.slice(2);
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());

if (command === undefined) {
  let previous = "";
  const monitor = new BatteryMonitor({
    slot: INDICATOR_SLOT,
    indicators: INDICATORS,
    onUpdate: (update) => {
      const line = describeUpdate(update, INDICATORS);
      if (line === previous) return;
      previous = line;
      console.log(`${new Date().toLocaleTimeString("pt-BR")}  ${line}`);
    },
  });
  await monitor.run(stop.signal);
} else if (command === "preview" && key !== undefined && isIndicatorKey(key)) {
  console.log(`prévia: ${INDICATORS[key].label}. Ctrl+C devolve a luz original.`);
  await runPreview(key, INDICATOR_SLOT, stop.signal);
} else {
  console.error(`uso: npm run battery-led [preview <${Object.keys(INDICATORS).join("|")}>]`);
  process.exitCode = 1;
}
