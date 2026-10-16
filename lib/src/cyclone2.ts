import type { ColorInput } from "./color.js";
import { Cmd, Profile, STATE_REPORT_ID } from "./constants.js";
import { decodeGameProfile, encodeGameProfile, type GameProfile, type MappedButton } from "./game-profile.js";
import {
  type Animation,
  animation,
  decodeLightProfile,
  diffRange,
  encodeLightProfile,
  type FrameInput,
  type LightProfile,
  solidFrame,
} from "./lighting.js";
import { applyPreset, type PresetName } from "./presets.js";
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

export type GameProfileNumber = 1 | 2 | 3 | 4 | 5;

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
  /** Última imagem conhecida de cada perfil, base para escrever só o diff. */
  private profileCache = new Map<number, Uint8Array>();
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

  /** Disparado quando o perfil muda pelo próprio controle (ex.: M + analógico troca a animação). */
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

  async readFirmwareVersion(): Promise<P.FirmwareVersion> {
    const raw = await this.request(P.readFwVersion(), { match: (r) => r[1] === Cmd.ReadFwVersionAck });
    return P.parseFirmwareVersion(raw);
  }

  /** 1..4, ou 5 quando a camada Shift está ativa. */
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
    this.profileCache.set(profileNum, out.slice());
    return out;
  }

  async writeProfile(profileNum: number, data: ArrayLike<number>, offset = 0): Promise<void> {
    for (const pkt of P.writeProfile(profileNum, data, offset)) await this.request(pkt);
    const cached = this.profileCache.get(profileNum);
    if (cached) cached.set(Array.from(data), offset);
  }

  /** Grava a imagem inteira do perfil escrevendo só o trecho que mudou, como o app. */
  async writeProfileImage(profileNum: number, image: Uint8Array): Promise<void> {
    const previous = this.profileCache.get(profileNum) ?? (await this.readProfile(profileNum));
    const range = diffRange(previous, image);
    if (range) await this.writeProfile(profileNum, image.slice(range.start, range.end + 1), range.start);
    this.profileCache.set(profileNum, image.slice());
  }

  async readGameProfile(profileNum: GameProfileNumber): Promise<GameProfile> {
    return decodeGameProfile(await this.readProfile(profileNum));
  }

  async writeGameProfile(profileNum: GameProfileNumber, profile: GameProfile): Promise<void> {
    await this.writeProfileImage(profileNum, encodeGameProfile(profile));
  }

  async updateGameProfile(
    profileNum: GameProfileNumber,
    change: (p: GameProfile) => GameProfile | undefined,
  ): Promise<GameProfile> {
    const current = await this.readGameProfile(profileNum);
    const next = change(current) ?? current;
    await this.writeGameProfile(profileNum, next);
    return next;
  }

  async remapButton(profileNum: GameProfileNumber, button: MappedButton, ...keys: number[]): Promise<void> {
    if (keys.length > 3) throw new RangeError("no máximo 3 teclas por botão");
    await this.updateGameProfile(profileNum, (p) => {
      const mapTo = [keys[0] ?? 0, keys[1] ?? 0, keys[2] ?? 0] as [number, number, number];
      p.buttons[button] = { ...p.buttons[button], mapEnabled: keys.length > 0, mapTo };
      return p;
    });
  }

  async setReportRate(profileNum: GameProfileNumber, rate: number): Promise<void> {
    await this.updateGameProfile(profileNum, (p) => {
      p.fun.reportRate = rate;
      return p;
    });
  }

  async readLightProfile(): Promise<LightProfile> {
    return decodeLightProfile(await this.readProfile(Profile.Light));
  }

  async writeLightProfile(profile: LightProfile): Promise<void> {
    await this.writeProfileImage(Profile.Light, encodeLightProfile(profile));
  }

  async updateLightProfile(change: (p: LightProfile) => LightProfile | undefined): Promise<LightProfile> {
    const current = await this.readLightProfile();
    const next = change(current) ?? current;
    await this.writeLightProfile(next);
    return next;
  }

  /** Mesma troca que M + analógico esquerdo faz no controle. */
  async setActiveAnimation(index: number): Promise<void> {
    await this.updateLightProfile((p) => {
      p.activeAnimation = index;
      return p;
    });
  }

  async setAnimation(anim: Animation, { slot, activate = true }: { slot?: number; activate?: boolean } = {}) {
    return this.updateLightProfile((p) => {
      const target = slot ?? p.activeAnimation;
      p.animations[target] = anim;
      if (activate) p.activeAnimation = target;
      return p;
    });
  }

  async applyPreset(name: PresetName, slot?: number): Promise<LightProfile> {
    return this.updateLightProfile((p) => {
      const target = slot ?? p.activeAnimation;
      p.animations[target] = applyPreset(p.animations[target], name);
      p.activeAnimation = target;
      return p;
    });
  }

  /** Cor fixa: uma cor para todas as zonas, ou uma por zona. */
  async setStaticColor(color: ColorInput | FrameInput, opts: { slot?: number; brightness?: number } = {}) {
    const isPerZone = typeof color === "object" && !Array.isArray(color) && !("r" in color);
    const frame = isPerZone ? (color as FrameInput) : solidFrame(color as ColorInput);
    return this.setAnimation(animation([frame], { brightness: opts.brightness }), { slot: opts.slot });
  }

  async setStandbyTime(minutes: number): Promise<void> {
    await this.updateLightProfile((p) => {
      p.standbyTime = minutes;
      return p;
    });
  }

  async setRaiseToWake(enabled: boolean): Promise<void> {
    await this.updateLightProfile((p) => {
      p.raiseWakeUp = enabled;
      return p;
    });
  }

  async setAudioReactive(enabled: boolean): Promise<void> {
    await this.updateLightProfile((p) => {
      p.audioReactiveMode = enabled;
      return p;
    });
  }

  async playLights(): Promise<void> {
    await this.send(P.setLightStatus(true, 1));
  }

  /** Pausa a animação mostrando o frame `frameIndex` (0..7) da animação ativa. */
  async showFrame(frameIndex: number): Promise<void> {
    await this.send(P.setLightStatus(false, frameIndex + 1));
  }

  async vibrate(left: number, right: number, durationMs = 1000): Promise<void> {
    await this.send(P.vibrate(left, right));
    if (durationMs > 0) {
      await sleep(durationMs);
      await this.send(P.vibrate(0, 0));
    }
  }

  async setMacroRecording(button: keyof typeof P.MacroKey, state: P.MacroRecordState): Promise<void> {
    await this.send(P.setMacroRecord(button, state));
  }
}
