import { createServer, type Server } from "node:net";
import { isSea } from "node:sea";
import { setTimeout as sleep } from "node:timers/promises";
import { type Rgb, toRgb } from "gamesir-hid";
import { indicatorsFor } from "../indicators.js";
import { BatteryMonitor, type MonitorUpdate } from "../monitor.js";
import { indicatorKey } from "../status.js";
import { isAutostartEnabled, setAutostart } from "./autostart.js";
import { log, startLog } from "./log.js";
import { type MenuEntry, Tray } from "./tray.js";

const NAME = "Cyclone2Battery";
const INSTANCE_PIPE = "\\\\.\\pipe\\cyclone2-battery";
const SLOT = 3;
const IDLE = toRgb("#808080");
const QUIT_GRACE_MS = 5000;

const indicators = indicatorsFor("Home");

interface Shown {
  readonly text: string;
  readonly color: Rgb;
}

const SEARCHING: Shown = { text: "procurando o controle…", color: IDLE };

function describe(update: MonitorUpdate): Shown | undefined {
  switch (update.kind) {
    case "searching":
    case "disconnected":
      return SEARCHING;
    case "connected":
      return { text: `conectado pelo ${update.connection}`, color: IDLE };
    case "no-signal":
      return { text: `sem sinal (${update.connection})`, color: IDLE };
    case "battery": {
      const { status, connection } = update;
      const indicator = indicators[indicatorKey(status)];
      const percent = status.kind === "charged" ? 100 : status.percent;
      return { text: `${percent}% · ${indicator.label} (${connection})`, color: toRgb(indicator.icon) };
    }
    case "light":
    case "error":
      return undefined;
  }
}

function logLine(update: MonitorUpdate): string {
  switch (update.kind) {
    case "light":
      return `luz: ${update.shown}`;
    case "error":
      return `erro: ${update.message}`;
    default:
      return describe(update)?.text ?? update.kind;
  }
}

/** Uma segunda instância encontra o pipe já ocupado e sai. */
function claimInstance(): Promise<Server | null> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(null));
    server.listen(INSTANCE_PIPE, () => resolve(server));
  });
}

export async function runTray(): Promise<void> {
  const instance = await claimInstance();
  if (!instance) return;

  startLog();
  process.on("uncaughtException", (error) => {
    log(`falha: ${error.stack ?? error.message}`);
    process.exit(1);
  });

  let shown = SEARCHING;
  let quitting = false;
  const stop = new AbortController();

  const monitor = new BatteryMonitor({
    slot: SLOT,
    indicators,
    onUpdate: (update) => {
      log(logLine(update));
      shown = describe(update) ?? shown;
      refresh();
    },
  });

  const tooltip = () => `Cyclone 2: ${shown.text}${monitor.isPaused ? " · pausado" : ""}`;
  const refresh = () => tray.update(tooltip(), shown.color);

  const togglePause = () => {
    void monitor.setPaused(!monitor.isPaused).then(refresh);
    refresh();
  };

  const toggleAutostart = () => {
    const enable = !isAutostartEnabled();
    if (!setAutostart(enable, process.execPath)) log(`não ${enable ? "ativou" : "desativou"} o início com o Windows`);
  };

  const quit = async () => {
    if (quitting) return;
    quitting = true;
    stop.abort();
    await Promise.race([running, sleep(QUIT_GRACE_MS)]);
    tray.remove();
    instance.close();
    process.exit(0);
  };

  const menu = (): MenuEntry[] => [
    { label: tooltip() },
    "separator",
    { label: monitor.isPaused ? "Retomar" : "Pausar", onClick: togglePause, disabled: quitting },
    { label: "Iniciar com o Windows", checked: isAutostartEnabled(), onClick: toggleAutostart, disabled: !isSea() },
    "separator",
    { label: "Sair", onClick: () => void quit(), disabled: quitting },
  ];

  const tray = new Tray({ name: NAME, tooltip: tooltip(), icon: IDLE, menu });
  const running = monitor.run(stop.signal).catch((error: Error) => log(`falha: ${error.stack ?? error.message}`));
}
