import type { HidTransport } from "../transport/types.js";
import { diffRange } from "./binary.js";
import { Cmd, type GameProfileNumber, Profile, STATE_REPORT_ID } from "./constants.js";
import type { ControllerModel } from "./model.js";
import * as P from "./protocol.js";

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

export class GameSirController<State = unknown> {
  private pending: Pending | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private stateListeners = new Set<(s: State) => void>();
  private changeListeners = new Set<(c: P.ProfileChange) => void>();
  private rawListeners = new Set<(raw: Uint8Array) => void>();
  private disconnectListeners = new Set<(error?: Error) => void>();
  private connected = true;
  private unsubscribe: () => void;
  /** Base para escrever só o trecho alterado. */
  private profileCache = new Map<number, Uint8Array>();
  lastState: State | null = null;

  constructor(
    private readonly transport: HidTransport,
    readonly model: ControllerModel<State>,
  ) {
    const offReport = transport.onReport((raw) => this.handleReport(raw));
    const offDisconnect = transport.onDisconnect?.((error) => this.handleDisconnect(error));
    this.unsubscribe = () => {
      offReport();
      offDisconnect?.();
    };
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async start({ heartbeatMs = 1000, testMode = false } = {}): Promise<void> {
    await this.transport.write(P.heartbeat(testMode));
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.transport.write(P.heartbeat(testMode)).catch((error: Error) => this.handleDisconnect(error));
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

  /** Dispara uma vez; para continuar, feche e abra de novo. */
  onDisconnect(listener: (error?: Error) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  onState(listener: (s: State) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Mudanças feitas pelo próprio controle: M + analógico, fim de gravação de macro. */
  onProfileChanged(listener: (c: P.ProfileChange) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  onRaw(listener: (raw: Uint8Array) => void): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  nextState(timeoutMs = 3000): Promise<State> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error("nenhum report de estado recebido; chamou start()?"));
      }, timeoutMs);
      const off = this.onState((s) => {
        clearTimeout(timer);
        off();
        resolve(s);
      });
    });
  }

  send(packet: Uint8Array): Promise<void> {
    return this.transport.write(packet);
  }

  request(packet: Uint8Array, opts: RequestOptions = {}): Promise<Uint8Array> {
    const run = () => this.doRequest(packet, opts);
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async readFirmwareVersion(): Promise<P.FirmwareVersion> {
    const raw = await this.request(P.readFwVersion(), { match: (r) => r[1] === Cmd.ReadFwVersionAck });
    return P.parseFirmwareVersion(raw);
  }

  /** 1..4, ou 5 quando a camada Shift está ativa. */
  async readCurrentProfile(): Promise<number> {
    const raw = await this.request(P.readCurrentProfile(), { match: (r) => r[1] === Cmd.ReadCurrentProfileAck });
    return raw[2];
  }

  async switchProfile(profileNum: Exclude<GameProfileNumber, 5> | "Shift"): Promise<void> {
    await this.request(P.switchProfile(profileNum));
  }

  async readProfile(profileNum: number): Promise<Uint8Array> {
    const out = new Uint8Array(this.profileSize(profileNum));
    for (const pkt of P.readProfile(profileNum, out.length)) {
      const offset = (pkt[3] << 8) | pkt[4];
      const raw = await this.request(pkt, {
        match: (r) => r[1] === Cmd.ReadProfileAck && r[2] === profileNum && ((r[3] << 8) | r[4]) === offset,
      });
      const chunk = P.parseProfileChunk(raw);
      out.set(chunk.data, chunk.offset);
    }
    this.profileCache.set(profileNum, out.slice());
    return out;
  }

  async writeProfile(profileNum: number, data: ArrayLike<number>, offset = 0): Promise<void> {
    if (offset + data.length > this.profileSize(profileNum)) throw new RangeError("escrita passa do fim do perfil");
    for (const pkt of P.writeProfile(profileNum, data, offset)) await this.request(pkt);
    const cached = this.profileCache.get(profileNum);
    if (cached) cached.set(Array.from(data), offset);
  }

  async writeProfileImage(profileNum: number, image: Uint8Array): Promise<void> {
    const previous = this.profileCache.get(profileNum) ?? (await this.readProfile(profileNum));
    const range = diffRange(previous, image);
    if (range) await this.writeProfile(profileNum, image.slice(range.start, range.end + 1), range.start);
    this.profileCache.set(profileNum, image.slice());
  }

  async vibrate(left: number, right: number, durationMs = 1000): Promise<void> {
    await this.send(P.vibrate(left, right));
    if (durationMs > 0) {
      await sleep(durationMs);
      await this.send(P.vibrate(0, 0));
    }
  }

  private profileSize(profileNum: number): number {
    const size = this.model.profileSizes[profileNum];
    if (size === undefined) throw new RangeError(`${this.model.name} não tem o perfil ${profileNum}`);
    return size;
  }

  private handleReport(raw: Uint8Array): void {
    for (const l of this.rawListeners) l(raw);
    if (raw[0] === STATE_REPORT_ID) {
      const state = this.model.parseState(raw);
      if (state === null) return;
      this.lastState = state;
      for (const l of this.stateListeners) l(state);
      return;
    }
    const resp = P.parseResponse(raw);
    if (!resp) return;
    if (resp.cmd === Cmd.ProfileChanged) {
      const change = P.parseProfileChange(raw);
      if (change.profileNum === Profile.Current) this.profileCache.clear();
      else this.profileCache.delete(change.profileNum);
      for (const l of this.changeListeners) l(change);
      return;
    }
    if (this.pending?.match(raw)) {
      const p = this.pending;
      this.pending = null;
      p.resolve(raw);
    }
  }

  private handleDisconnect(error?: Error): void {
    if (!this.connected) return;
    this.connected = false;
    this.stopHeartbeat();
    for (const l of this.disconnectListeners) l(error);
  }

  private async doRequest(packet: Uint8Array, opts: RequestOptions): Promise<Uint8Array> {
    const { timeoutMs = 200, maxSends = 10, match = defaultMatch } = opts;
    let resolveFn!: (raw: Uint8Array) => void;
    const answered = new Promise<Uint8Array>((r) => {
      resolveFn = r;
    });
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
}
