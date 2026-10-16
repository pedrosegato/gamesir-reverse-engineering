import type { Indicators } from "./indicators.js";
import type { Connection, MonitorUpdate } from "./monitor.js";
import { indicatorKey } from "./status.js";

type ErrorUpdate = Extract<MonitorUpdate, { kind: "error" }>;

const ERROR_CONTEXT: Record<ErrorUpdate["during"], string> = {
  open: "não abriu o controle",
  session: "falha na sessão",
  light: "não gravou a luz",
};

const CONNECTION: Record<Connection, string> = { cable: "cabo", wireless: "sem fio", dongle: "dongle" };

export function describeUpdate(update: MonitorUpdate, indicators: Indicators): string {
  switch (update.kind) {
    case "searching":
      return "procurando o controle…";
    case "connected":
      return `conectado pelo ${CONNECTION[update.connection]}`;
    case "battery": {
      const { status, connection } = update;
      const percent = status.kind === "charged" ? 100 : status.percent;
      return `${percent}% · ${indicators[indicatorKey(status)].label} (${CONNECTION[connection]})`;
    }
    case "no-signal":
      return `sem sinal (${CONNECTION[update.connection]})`;
    case "light":
      return update.shown === "original" ? "luz original restaurada" : `luz: ${indicators[update.shown].label}`;
    case "disconnected":
      return "desconectado";
    case "error":
      return `${ERROR_CONTEXT[update.during]}: ${update.message}`;
  }
}
