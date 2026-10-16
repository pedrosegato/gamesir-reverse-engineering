import { Cmd, LIGHT_PROFILE_SIZE, Profile, STATE_REPORT_ID } from "./constants.js";
import { decodeLightProfile, diffRange, encodeLightProfile, type LightProfile } from "./lighting.js";
import * as P from "./protocol.js";
import { type GamepadState, isStateReport, parseState } from "./state.js";
import type { HidTransport } from "./transport/types.js";

type Matcher = (raw: Uint8Array) => boolean;

interface Pending {
  match: Matcher;
  resolve: (raw: Uint8Array) => void;
}

export interface RequestOptions {
  timeoutMs?: number;
  maxSends?: number;
  match?: Matcher;
}

const NOTIFICATIONS = new Set<number>([Cmd.ReadRgbAck, Cmd.ProfileChanged]);

const defaultMatch: Matcher = (raw) => !NOTIFICATIONS.has(raw[1]) && !P.isBusyAck(raw);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class Cyclone2 {
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stateListeners = new Set<(s: GamepadState) => void>();
  private changeListeners = new Set<(c: P.ProfileChange) => void>();
  private rawListeners = new Set<(raw: Uint8Array) => void>();
  private unsubscribe: () => void;
  private lightCache: Uint8Array | null = null;
  lastState: GamepadState | null = null;

  constructor(private readonly transport: HidTransport) {
    this.unsubscribe = transport.onReport((raw) => this.handleReport(raw));
  }

  async start({ heartbeatMs = 1000, testMode = false } = {}): Promise<void> {
    await this.transport.write(P.heartbeat(testMode));
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.transport.write(P.heartbeat(testMode)).catch(() => this.stopHeartbeat());
    }, heartbeatMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  async close(): Promise<void> {
    this.stopHeartbeat();
    this.unsubscribe();
    await this.transport.close();
  }

  onState(listener: (s: GamepadState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Disparado quando o perfil muda pelo próprio controle (ex.: atalho de LED). */
  onProfileChanged(listener: (c: P.ProfileChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onRaw(listener: (raw: Uint8Array) => void): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  nextState(timeoutMs = 3000): Promise<GamepadState> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        off();
        reject(new Error("nenhum report de estado recebido; chamou start()?"));
      }, timeoutMs);
      const off = this.onState((s) => {
        clearTimeout(t);
        off();
        resolve(s);
      });
    });
  }

  private handleReport(raw: Uint8Array): void {
    for (const l of this.rawListeners) l(raw);
    if (raw[0] === STATE_REPORT_ID) {
      if (!isStateReport(raw)) return;
      const s = parseState(raw);
      this.lastState = s;
      for (const l of this.stateListeners) l(s);
      return;
    }
    const resp = P.parseResponse(raw);
    if (!resp) return;
    if (resp.cmd === Cmd.ProfileChanged) {
      const change = P.parseProfileChange(raw);
      if (change.profileNum === Profile.Light) this.lightCache = null;
      for (const l of this.changeListeners) l(change);
      return;
    }
    if (this.pending?.match(raw)) {
      const p = this.pending;
      this.pending = null;
      p.resolve(raw);
    }
  }

  send(packet: Uint8Array): Promise<void> {
    return this.transport.write(packet);
  }

  /** Um pedido por vez; reenvia a cada `timeoutMs` até chegar resposta, como a fila do app. */
  request(packet: Uint8Array, opts: RequestOptions = {}): Promise<Uint8Array> {
    const run = () => this.doRequest(packet, opts);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async doRequest(packet: Uint8Array, opts: RequestOptions): Promise<Uint8Array> {
    const { timeoutMs = 200, maxSends = 10, match = defaultMatch } = opts;
    let resolveFn!: (raw: Uint8Array) => void;
    const answered = new Promise<Uint8Array>((r) => (resolveFn = r));
    this.pending = { match, resolve: resolveFn };
    try {
      for (let sent = 0; sent < maxSends; sent++) {
        await this.transport.write(packet);
        const raw = await Promise.race([answered, sleep(timeoutMs).then(() => null)]);
        if (raw) return raw;
      }
      throw new Error(`sem resposta para ${P.parseResponse(packet)?.name ?? "comando"} após ${maxSends} envios`);
    } finally {
      if (this.pending?.resolve === resolveFn) this.pending = null;
    }
  }

  async readFirmwareVersionRaw(): Promise<Uint8Array> {
    return this.request(P.readFwVersion(), { match: (r) => r[1] === Cmd.ReadFwVersionAck });
  }

  async readCurrentProfile(): Promise<number> {
    const raw = await this.request(P.readCurrentProfile(), { match: (r) => r[1] === Cmd.ReadCurrentProfileAck });
    return raw[2];
  }

  async switchProfile(profileNum: 1 | 2 | 3 | 4 | "Shift"): Promise<void> {
    await this.request(P.switchProfile(profileNum));
  }

  async readProfile(profileNum: number): Promise<Uint8Array> {
    const out = new Uint8Array(P.profileSize(profileNum));
    for (const pkt of P.readProfile(profileNum)) {
      const offset = (pkt[3] << 8) | pkt[4];
      const raw = await this.request(pkt, {
        match: (r) => r[1] === Cmd.ReadProfileAck && r[2] === profileNum && ((r[3] << 8) | r[4]) === offset,
      });
      const chunk = P.parseProfileChunk(raw);
      out.set(chunk.data, chunk.offset);
    }
    return out;
  }

  async writeProfile(profileNum: number, data: ArrayLike<number>, offset = 0): Promise<void> {
    for (const pkt of P.writeProfile(profileNum, data, offset)) await this.request(pkt);
  }

  async readLightProfile(): Promise<LightProfile> {
    const bytes = await this.readProfile(Profile.Light);
    this.lightCache = bytes;
    return decodeLightProfile(bytes);
  }

  /** Escreve só o trecho que mudou desde a última leitura/escrita, como o app. */
  async writeLightProfile(profile: LightProfile): Promise<void> {
    const next = encodeLightProfile(profile);
    if (next.length !== LIGHT_PROFILE_SIZE) throw new Error("perfil de luz com tamanho errado");
    const prev = this.lightCache ?? (await this.readProfile(Profile.Light));
    const range = diffRange(prev, next);
    if (range) await this.writeProfile(Profile.Light, next.slice(range.start, range.end + 1), range.start);
    this.lightCache = next;
  }

  async updateLightProfile(fn: (p: LightProfile) => undefined | LightProfile): Promise<LightProfile> {
    const p = await this.readLightProfile();
    const next = fn(p) ?? p;
    await this.writeLightProfile(next);
    return next;
  }

  async setLightStatus(playing: boolean, frameIndex = 0): Promise<void> {
    await this.send(P.setLightStatus(playing, frameIndex));
  }

  async vibrate(left: number, right: number, durationMs = 1000): Promise<void> {
    await this.send(P.vibrate(left, right));
    if (durationMs > 0) {
      await sleep(durationMs);
      await this.send(P.vibrate(0, 0));
    }
  }

  async setMacroRecord(button: "FL1" | "FR1", state: number): Promise<void> {
    await this.send(P.setMacroRecord(button, state));
  }
}
