import { parseArgs } from "node:util";
import { LED_ZONES, type LedZone, USER_ANIMATION_COUNT } from "gamesir-hid";
import { indicatorsFor } from "./indicators.js";
import { BatteryMonitor, type MonitorUpdate } from "./monitor.js";
import { type BatteryStatus, indicatorKey } from "./status.js";

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
    throw new Error(`--slot vai de 1 a ${USER_ANIMATION_COUNT}`);
  }
  const zone = values.zone ?? "Home";
  if (!isLedZone(zone)) throw new Error(`--zone aceita ${LED_ZONES.join(", ")}`);
  return { slot: slot - 1, zone };
}

const options = parseOptions(process.argv.slice(2));
const indicators = indicatorsFor(options.zone);

function battery(status: BatteryStatus): string {
  const { label } = indicators[indicatorKey(status)];
  return status.kind === "charged" ? `100% · ${label}` : `${status.percent}% · ${label}`;
}

function describe(update: MonitorUpdate): string {
  switch (update.kind) {
    case "searching":
      return "procurando o Cyclone 2…";
    case "connected":
      return `conectado pelo ${update.connection}`;
    case "battery":
      return battery(update.status);
    case "no-signal":
      return "sem report de estado: controle dormindo ou fora de alcance";
    case "light":
      return update.shown === "original"
        ? "luz original restaurada"
        : `luz atualizada: ${indicators[update.shown].label}`;
    case "disconnected":
      return "desconectado";
    case "error":
      return update.message;
  }
}

let previous = "";
const monitor = new BatteryMonitor({
  slot: options.slot,
  indicators,
  onUpdate: (update) => {
    const line = describe(update);
    if (line === previous) return;
    previous = line;
    console.log(`${new Date().toLocaleTimeString("pt-BR")}  ${line}`);
  },
});

const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());
await monitor.run(stop.signal);
