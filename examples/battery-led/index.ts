import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import {
  type Animation,
  Cyclone2,
  Cyclone2Pid,
  type Cyclone2State,
  LED_ZONES,
  type LedZone,
  USER_ANIMATION_COUNT,
} from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import { indicatorsFor } from "./indicators.js";
import { type BatteryStatus, classify, type IndicatorKey, indicatorKey } from "./status.js";

const RECONNECT_MS = 2000;
const SILENCE_MS = 5000;

const CONNECTION: Partial<Record<number, string>> = {
  [Cyclone2Pid.Wired]: "cabo",
  [Cyclone2Pid.WiredAdc]: "cabo",
  [Cyclone2Pid.Wireless]: "sem fio",
  [Cyclone2Pid.WirelessDongle]: "dongle",
};

interface Options {
  readonly slot: number;
  readonly zone: LedZone;
}

interface SavedLight {
  readonly activeAnimation: number;
  readonly animation: Animation;
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

const log = (message: string) => console.log(`${new Date().toLocaleTimeString("pt-BR")}  ${message}`);
const wait = (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => undefined);

const options = parseOptions(process.argv.slice(2));
const indicators = indicatorsFor(options.zone);
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => stop.abort());

/** Só na primeira conexão: depois de reconectar, o slot já contém o indicador. */
let saved: SavedLight | undefined;

function describe(status: BatteryStatus): string {
  const label = indicators[indicatorKey(status)].label;
  return status.kind === "charged" ? `100% · ${label}` : `${status.percent}% · ${label}`;
}

async function waitForController(signal: AbortSignal): Promise<Cyclone2 | null> {
  let announced = false;
  while (!signal.aborted) {
    const [info] = await findControllers();
    if (info?.path) {
      try {
        const pad = new Cyclone2(await NodeHidTransport.open(info.path));
        await pad.start();
        log(`conectado pelo ${CONNECTION[info.productId] ?? `PID 0x${info.productId.toString(16)}`}`);
        return pad;
      } catch (error) {
        log(`não abriu: ${(error as Error).message}`);
      }
    } else if (!announced) {
      log("procurando o Cyclone 2…");
      announced = true;
    }
    await wait(RECONNECT_MS, signal);
  }
  return null;
}

async function runSession(pad: Cyclone2, signal: AbortSignal): Promise<void> {
  if (!saved) {
    const light = await pad.readLightProfile();
    saved = { activeAnimation: light.activeAnimation, animation: light.animations[options.slot] };
  }

  let status: BatteryStatus | undefined;
  let requested: IndicatorKey | undefined;
  let lastSample: Pick<Cyclone2State, "batteryLevel" | "chargeState"> | undefined;
  let writes: Promise<unknown> = Promise.resolve();

  const show = (key: IndicatorKey) => {
    requested = key;
    writes = writes
      .then(() => pad.setAnimation(indicators[key].animation, { slot: options.slot }))
      .catch((error: Error) => log(`não gravou a luz: ${error.message}`));
  };

  const reason = await new Promise<string>((resolve) => {
    const finish = (why: string) => {
      clearTimeout(silence);
      offState();
      offDisconnect();
      signal.removeEventListener("abort", onAbort);
      resolve(why);
    };
    let quiet = false;
    const silence = setTimeout(() => {
      quiet = true;
      log("sem report de estado: controle dormindo ou fora de alcance");
    }, SILENCE_MS);
    const offState = pad.onState(({ batteryLevel, chargeState }) => {
      silence.refresh();
      if (quiet) {
        quiet = false;
        log("controle respondendo de novo");
      }
      if (batteryLevel === lastSample?.batteryLevel && chargeState === lastSample.chargeState) return;
      lastSample = { batteryLevel, chargeState };

      status = classify({ percent: batteryLevel, charging: chargeState === 1 }, status);
      const key = indicatorKey(status);
      const changed = key !== requested;
      log(`${describe(status)}${changed ? "  → luz atualizada" : ""}`);
      if (changed) show(key);
    });
    const offDisconnect = pad.onDisconnect(() => finish("desconectado"));
    const onAbort = () => finish("encerrando");
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });

  await writes;
  if (signal.aborted && pad.isConnected && saved) {
    const { activeAnimation, animation } = saved;
    await pad.updateLightProfile((light) => ({
      ...light,
      activeAnimation,
      animations: light.animations.map((a, i) => (i === options.slot ? animation : a)),
    }));
    log("luz original restaurada");
  }
  await pad.close();
  log(reason);
}

while (!stop.signal.aborted) {
  const pad = await waitForController(stop.signal);
  if (!pad) break;
  await runSession(pad, stop.signal);
}
