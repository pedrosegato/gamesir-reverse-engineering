import { createServer, type Server } from "node:net";
import { isSea } from "node:sea";
import { setTimeout as sleep } from "node:timers/promises";
import { type Rgb, toRgb } from "gamesir-hid";
import { indicatorsFor } from "../indicators.js";
import { describeUpdate } from "../messages.js";
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
/** The controller is searched for when Windows reports a HID device change; this interval is only a fallback. */
const FALLBACK_SEARCH_MS = 30_000;

const indicators = indicatorsFor("Home");

interface Shown {
  readonly text: string;
  readonly color: Rgb;
}

function shownFor(update: MonitorUpdate): Shown | undefined {
  if (update.kind === "light" || update.kind === "error") return undefined;
  const color = update.kind === "battery" ? toRgb(indicators[indicatorKey(update.status)].icon) : IDLE;
  return { text: describeUpdate(update, indicators), color };
}

/** A second instance finds the pipe taken and exits. */
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

  let shown: Shown = { text: describeUpdate({ kind: "searching" }, indicators), color: IDLE };
  let quitting = false;
  const stop = new AbortController();

  const monitor = new BatteryMonitor({
    slot: SLOT,
    indicators,
    timing: { searchEveryMs: FALLBACK_SEARCH_MS },
    onUpdate: (update) => {
      log(describeUpdate(update, indicators));
      shown = shownFor(update) ?? shown;
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

  const tray = new Tray({
    name: NAME,
    tooltip: tooltip(),
    icon: IDLE,
    menu,
    onError: (operation, code) => log(`bandeja: ${operation} falhou (erro ${code})`),
    onDeviceChange: () => monitor.rescan(),
  });
  log(tray.added ? "ícone adicionado na bandeja" : "ícone ainda não adicionado; tentando de novo");
  const running = monitor.run(stop.signal).catch((error: Error) => log(`falha: ${error.stack ?? error.message}`));
}
