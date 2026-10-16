import { setTimeout as sleep } from "node:timers/promises";
import { type Animation, Cyclone2, Cyclone2Pid, type HidTransport, protocol } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import type { Indicators } from "./indicators.js";
import { type BatterySample, type BatteryStatus, classify, type IndicatorKey, indicatorKey } from "./status.js";

export type Connection = "cable" | "wireless" | "dongle";

const CONNECTIONS: Partial<Record<number, Connection>> = {
  [Cyclone2Pid.Wired]: "cable",
  [Cyclone2Pid.WiredAdc]: "cable",
  [Cyclone2Pid.Wireless]: "wireless",
  [Cyclone2Pid.WirelessDongle]: "dongle",
};

export type LightShown = IndicatorKey | "original";

export type MonitorUpdate =
  | { readonly kind: "searching" }
  | { readonly kind: "connected"; readonly connection: Connection }
  | { readonly kind: "battery"; readonly connection: Connection; readonly status: BatteryStatus }
  | { readonly kind: "no-signal"; readonly connection: Connection }
  | { readonly kind: "light"; readonly shown: LightShown }
  | { readonly kind: "disconnected" }
  | { readonly kind: "error"; readonly during: "open" | "session" | "light"; readonly message: string };

export interface FoundPad {
  readonly transport: HidTransport;
  readonly connection: Connection;
}

/**
 * Each sample is a single heartbeat, which makes the controller stream its state for about a second. On battery
 * that radio time costs charge, so samples are spaced out; on cable or while charging they can be frequent.
 */
export interface MonitorTiming {
  readonly sampleOnBatteryMs: number;
  readonly sampleOnPowerMs: number;
  readonly sampleTimeoutMs: number;
  readonly searchEveryMs: number;
}

export interface MonitorOptions {
  readonly slot: number;
  readonly indicators: Indicators;
  readonly onUpdate: (update: MonitorUpdate) => void;
  readonly find?: () => Promise<FoundPad | null>;
  readonly timing?: Partial<MonitorTiming>;
}

const DEFAULT_TIMING: MonitorTiming = {
  sampleOnBatteryMs: 60_000,
  sampleOnPowerMs: 5000,
  sampleTimeoutMs: 1500,
  searchEveryMs: 3000,
};

interface SavedLight {
  readonly activeAnimation: number;
  readonly animation: Animation;
}

interface Session {
  readonly pad: Cyclone2;
  readonly connection: Connection;
  status?: BatteryStatus;
  shown?: LightShown;
  writes: Promise<void>;
}

async function findPad(): Promise<FoundPad | null> {
  const [found] = await findControllers();
  if (!found) return null;
  return { transport: await NodeHidTransport.open(found.path), connection: CONNECTIONS[found.productId] ?? "cable" };
}

const wait = (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => undefined);

export class BatteryMonitor {
  private readonly find: () => Promise<FoundPad | null>;
  private readonly timing: MonitorTiming;
  private paused = false;
  private wake = new AbortController();
  private stopping = false;
  private session: Session | undefined;
  /** Only on the first connection: after a reconnect the slot already holds the indicator. */
  private saved: SavedLight | undefined;

  constructor(private readonly options: MonitorOptions) {
    this.find = options.find ?? findPad;
    this.timing = { ...DEFAULT_TIMING, ...options.timing };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Returns once `signal` fires, after putting the original light back. */
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const found = await this.connect(signal);
      if (!found) break;
      await this.watch(found, signal);
    }
  }

  /** Cuts the wait between searches short, e.g. when a USB device is plugged in. */
  rescan(): void {
    this.wake.abort();
  }

  async setPaused(paused: boolean): Promise<void> {
    this.paused = paused;
    if (this.session) await this.apply(this.session);
  }

  private report(update: MonitorUpdate): void {
    this.options.onUpdate(update);
  }

  private async connect(signal: AbortSignal): Promise<FoundPad | null> {
    let announced = false;
    while (!signal.aborted) {
      try {
        const found = await this.find();
        if (found) return found;
        if (!announced) this.report({ kind: "searching" });
        announced = true;
      } catch (error) {
        this.report({ kind: "error", during: "open", message: (error as Error).message });
      }
      await wait(this.timing.searchEveryMs, AbortSignal.any([signal, this.wake.signal]));
      if (this.wake.signal.aborted) this.wake = new AbortController();
    }
    return null;
  }

  private async watch({ transport, connection }: FoundPad, signal: AbortSignal): Promise<void> {
    const pad = new Cyclone2(transport);
    const lost = new AbortController();
    const offDisconnect = pad.onDisconnect(() => lost.abort());
    const until = AbortSignal.any([signal, lost.signal]);
    const session: Session = { pad, connection, writes: Promise.resolve() };
    this.report({ kind: "connected", connection });

    try {
      this.saved ??= await this.readSlot(pad);
      this.session = session;
      while (!until.aborted) {
        await this.sample(session);
        await wait(this.sampleInterval(session), until);
      }
    } catch (error) {
      if (pad.isConnected) {
        this.report({ kind: "error", during: "session", message: (error as Error).message });
        await wait(this.timing.searchEveryMs, until);
      }
    } finally {
      this.session = undefined;
    }

    if (signal.aborted && pad.isConnected) {
      this.stopping = true;
      await this.apply(session);
    }
    offDisconnect();
    await pad.close();
    if (lost.signal.aborted && !signal.aborted) this.report({ kind: "disconnected" });
  }

  private sampleInterval({ connection, status }: Session): number {
    const onBattery = connection !== "cable" && (status === undefined || status.kind === "discharging");
    return onBattery ? this.timing.sampleOnBatteryMs : this.timing.sampleOnPowerMs;
  }

  private async readSlot(pad: Cyclone2): Promise<SavedLight> {
    const light = await pad.readLightProfile();
    return { activeAnimation: light.activeAnimation, animation: light.animations[this.options.slot] };
  }

  private async sample(session: Session): Promise<void> {
    const sample = await this.readBattery(session.pad, session.connection);
    if (!sample) {
      this.report({ kind: "no-signal", connection: session.connection });
      return;
    }
    session.status = classify(sample, session.status);
    this.report({ kind: "battery", connection: session.connection, status: session.status });
    await this.apply(session);
  }

  /** Once fully charged the controller stops reporting charging, but on cable it is still powered. */
  private async readBattery(pad: Cyclone2, connection: Connection): Promise<BatterySample | null> {
    const next = pad.nextState(this.timing.sampleTimeoutMs).catch(() => null);
    await pad.send(protocol.heartbeat());
    const state = await next;
    return state && { percent: state.batteryLevel, powered: state.chargeState !== 0 || connection === "cable" };
  }

  private target(session: Session): LightShown | undefined {
    if (this.stopping || this.paused) return "original";
    return session.status && indicatorKey(session.status);
  }

  /** Writes are queued: each reads the light profile and writes only the difference. */
  private apply(session: Session): Promise<void> {
    session.writes = session.writes.then(async () => {
      const target = this.target(session);
      if (target === undefined || target === session.shown) return;
      try {
        await this.show(session.pad, target);
        session.shown = target;
        this.report({ kind: "light", shown: target });
      } catch (error) {
        this.report({ kind: "error", during: "light", message: (error as Error).message });
      }
    });
    return session.writes;
  }

  private async show(pad: Cyclone2, target: LightShown): Promise<void> {
    const { slot, indicators } = this.options;
    if (target !== "original") {
      await pad.setAnimation(indicators[target].animation, { slot });
      return;
    }
    const saved = this.saved;
    if (!saved) return;
    await pad.updateLightProfile((light) => ({
      ...light,
      activeAnimation: saved.activeAnimation,
      animations: light.animations.map((a, i) => (i === slot ? saved.animation : a)),
    }));
  }
}
