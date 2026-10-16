import {
  type Animation,
  Cmd,
  decodeLightProfile,
  encodeLightProfile,
  type HidTransport,
  LIGHT_PROFILE_SIZE,
  LightOffset,
  Profile,
  RESPONSE_REPORT_ID,
  STATE_REPORT_ID,
} from "gamesir-hid";
import { describe, expect, it } from "vitest";
import { indicatorsFor } from "./indicators.js";
import { BatteryMonitor, type Connection, type FoundPad, type MonitorTiming, type MonitorUpdate } from "./monitor.js";

const SLOT = 3;
const ANIMATION_SIZE = 124;
const indicators = indicatorsFor("Home");

class FakePad implements HidTransport {
  readonly light = new Uint8Array(LIGHT_PROFILE_SIZE).fill(7, 1).fill(1, 0, 1);
  percent = 40;
  charging = false;
  asleep = false;
  private listener: ((r: Uint8Array) => void) | null = null;
  private disconnectListener: ((error?: Error) => void) | null = null;

  async write(report: Uint8Array): Promise<void> {
    const [, cmd, num, hi, lo, len] = report;
    if (cmd === Cmd.Heartbeat) {
      if (!this.asleep) this.emit(this.stateReport());
      return;
    }
    if (num !== Profile.Light) return;
    const offset = (hi << 8) | lo;
    const reply = new Uint8Array(64);
    reply[0] = RESPONSE_REPORT_ID;
    if (cmd === Cmd.ReadProfile) {
      reply.set([Cmd.ReadProfileAck, num, hi, lo, len], 1);
      reply.set(this.light.slice(offset, offset + len), 6);
    } else if (cmd === Cmd.WriteProfile) {
      this.light.set(report.slice(6, 6 + len), offset);
      reply.set([Cmd.Ack, 0], 1);
    }
    this.emit(reply);
  }

  onReport(listener: (r: Uint8Array) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  onDisconnect(listener: (error?: Error) => void): () => void {
    this.disconnectListener = listener;
    return () => {
      this.disconnectListener = null;
    };
  }

  unplug(): void {
    this.disconnectListener?.(new Error("device removed"));
  }

  slot(): Uint8Array {
    return this.light.slice(LightOffset.animation(SLOT), LightOffset.animation(SLOT) + ANIMATION_SIZE);
  }

  async close(): Promise<void> {}

  private stateReport(): Uint8Array {
    const report = new Uint8Array(64);
    report[0] = STATE_REPORT_ID;
    report[35] = this.charging ? 1 : 0;
    report[36] = this.percent;
    return report;
  }

  private emit(report: Uint8Array): void {
    queueMicrotask(() => this.listener?.(report));
  }
}

function slotWith(pad: FakePad, animation: Animation): Uint8Array {
  const profile = decodeLightProfile(pad.light);
  profile.animations[SLOT] = animation;
  return encodeLightProfile(profile).slice(LightOffset.animation(SLOT), LightOffset.animation(SLOT) + ANIMATION_SIZE);
}

interface StartOptions {
  readonly connection?: Connection;
  readonly timing?: Partial<MonitorTiming>;
}

function start(pads: FakePad[], { connection = "dongle", timing }: StartOptions = {}) {
  const updates: MonitorUpdate[] = [];
  const waiters: { match: (u: MonitorUpdate) => boolean; resolve: () => void }[] = [];
  const queue = [...pads];
  const monitor = new BatteryMonitor({
    slot: SLOT,
    indicators,
    timing: { sampleOnBatteryMs: 5, sampleOnPowerMs: 5, sampleTimeoutMs: 30, searchEveryMs: 5, ...timing },
    find: async (): Promise<FoundPad | null> => {
      const transport = queue.shift();
      return transport ? { transport, connection } : null;
    },
    onUpdate: (update) => {
      updates.push(update);
      for (const w of waiters.filter((w) => w.match(update))) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    },
  });
  const stop = new AbortController();
  const running = monitor.run(stop.signal);
  const until = (match: (u: MonitorUpdate) => boolean) =>
    new Promise<void>((resolve) => {
      if (updates.some(match)) resolve();
      else waiters.push({ match, resolve });
    });
  const finish = async () => {
    stop.abort();
    await running;
  };
  return { monitor, queue, updates, until, finish };
}

const lightIs = (shown: string) => (u: MonitorUpdate) => u.kind === "light" && u.shown === shown;

describe("BatteryMonitor", () => {
  it("shows the battery level in the slot and restores the original light on stop", async () => {
    const pad = new FakePad();
    const original = pad.slot();
    const run = start([pad]);

    await run.until(lightIs("medium"));
    expect(pad.slot()).toEqual(slotWith(pad, indicators.medium.animation));
    expect(pad.light[LightOffset.ConfigIndex]).toBe(SLOT);

    await run.finish();
    expect(pad.slot()).toEqual(original);
    expect(pad.light[LightOffset.ConfigIndex]).toBe(1);
  });

  it("follows level changes and the cable", async () => {
    const pad = new FakePad();
    const run = start([pad]);
    await run.until(lightIs("medium"));

    pad.percent = 80;
    await run.until(lightIs("high"));
    pad.charging = true;
    await run.until(lightIs("charging"));
    expect(pad.slot()).toEqual(slotWith(pad, indicators.charging.animation));
    await run.finish();
  });

  it("stays full on cable at 100 % after the controller stops reporting charge", async () => {
    const pad = new FakePad();
    pad.percent = 100;
    const run = start([pad], { connection: "cable" });
    await run.until(lightIs("charged"));
    expect(pad.slot()).toEqual(slotWith(pad, indicators.charged.animation));
    await run.finish();
  });

  it("pause restores the original light and resume reapplies the indicator", async () => {
    const pad = new FakePad();
    const original = pad.slot();
    const run = start([pad]);
    await run.until(lightIs("medium"));

    await run.monitor.setPaused(true);
    expect(pad.slot()).toEqual(original);
    await run.monitor.setPaused(false);
    expect(pad.slot()).toEqual(slotWith(pad, indicators.medium.animation));
    await run.finish();
  });

  it("reports when the controller does not answer the heartbeat", async () => {
    const pad = new FakePad();
    pad.asleep = true;
    const run = start([pad]);
    await run.until((u) => u.kind === "no-signal");
    await run.finish();
    expect(run.updates.some((u) => u.kind === "battery")).toBe(false);
  });

  it("samples rarely on battery and often on power", async () => {
    const timing = { sampleOnBatteryMs: 60_000, sampleOnPowerMs: 5 };
    const samples = (run: ReturnType<typeof start>) => run.updates.filter((u) => u.kind === "battery").length;

    const onBattery = start([new FakePad()], { timing });
    await onBattery.until((u) => u.kind === "battery");
    await new Promise((r) => setTimeout(r, 100));
    expect(samples(onBattery)).toBe(1);
    await onBattery.finish();

    const onCable = start([new FakePad()], { connection: "cable", timing });
    await new Promise((r) => setTimeout(r, 100));
    expect(samples(onCable)).toBeGreaterThan(3);
    await onCable.finish();
  });

  it("rescan searches right away instead of waiting for the next interval", async () => {
    const run = start([], { timing: { searchEveryMs: 60_000 } });
    await run.until((u) => u.kind === "searching");
    run.queue.push(new FakePad());
    run.monitor.rescan();
    await run.until((u) => u.kind === "connected");
    await run.finish();
  });

  it("reconnects and restores the slot saved on the first connection", async () => {
    const first = new FakePad();
    const original = first.slot();
    const second = new FakePad();
    const run = start([first, second]);
    await run.until(lightIs("medium"));

    second.light.set(first.light);
    first.unplug();
    await run.until((u) => u.kind === "disconnected");
    await run.until((u) => u.kind === "connected" && run.updates.filter((x) => x.kind === "connected").length === 2);

    await run.finish();
    expect(second.slot()).toEqual(original);
  });
});
