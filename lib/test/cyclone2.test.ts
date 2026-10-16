import { describe, expect, it } from "vitest";
import {
  Cmd,
  Cyclone2,
  GAME_PROFILE_SIZE,
  type HidTransport,
  LIGHT_PROFILE_SIZE,
  LightOffset,
  Profile,
  RESPONSE_REPORT_ID,
} from "../src/index.js";

/** Controle simulado: guarda os perfis em memória e responde como o firmware deveria. */
class FakeController implements HidTransport {
  profiles = new Map<number, Uint8Array>([
    [Profile.P1, new Uint8Array(GAME_PROFILE_SIZE)],
    [Profile.Light, new Uint8Array(LIGHT_PROFILE_SIZE).fill(5, 1, 125)],
  ]);
  written: Uint8Array[] = [];
  dropNext = 0;
  private listener: ((r: Uint8Array) => void) | null = null;

  async write(report: Uint8Array): Promise<void> {
    this.written.push(report);
    if (this.dropNext > 0) {
      this.dropNext--;
      return;
    }
    const [, cmd, num, hi, lo, len] = report;
    const offset = (hi << 8) | lo;
    const reply = new Uint8Array(64);
    reply[0] = RESPONSE_REPORT_ID;
    if (cmd === Cmd.ReadProfile) {
      reply.set([Cmd.ReadProfileAck, num, hi, lo, len], 1);
      reply.set(this.profiles.get(num)?.slice(offset, offset + len) ?? [], 6);
    } else if (cmd === Cmd.WriteProfile) {
      this.profiles.get(num)?.set(report.slice(6, 6 + len), offset);
      reply.set([Cmd.Ack, 0], 1);
    } else if (cmd === Cmd.ReadFwVersion) {
      reply.set([Cmd.ReadFwVersionAck], 1);
      reply.set(new TextEncoder().encode("123"), 4);
    } else {
      return;
    }
    queueMicrotask(() => this.listener?.(reply));
  }

  onReport(listener: (r: Uint8Array) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  /** Notificação espontânea do controle, ex.: `10 0F …` depois de gravar uma macro. */
  notify(bytes: number[]): void {
    const report = new Uint8Array(64);
    report[0] = RESPONSE_REPORT_ID;
    report.set(bytes, 1);
    this.listener?.(report);
  }

  async close(): Promise<void> {}
}

const writes = (fake: FakeController) => fake.written.filter((p) => p[1] === Cmd.WriteProfile);

describe("Cyclone2", () => {
  it("lê o perfil de luz bloco a bloco", async () => {
    const fake = new FakeController();
    const pad = new Cyclone2(fake);
    const light = await pad.readLightProfile();
    expect(fake.written).toHaveLength(Math.ceil(LIGHT_PROFILE_SIZE / 58));
    expect(light.animations[0].keyFrameCount).toBe(5);
  });

  it("escreve só o trecho alterado", async () => {
    const fake = new FakeController();
    const pad = new Cyclone2(fake);
    await pad.setActiveAnimation(2);
    expect(writes(fake)).toHaveLength(1);
    expect(Array.from(writes(fake)[0].slice(0, 7))).toEqual([0x0f, 0x03, 32, 0, 0, 1, 2]);
    expect(fake.profiles.get(Profile.Light)?.[LightOffset.ConfigIndex]).toBe(2);
  });

  it("cor fixa grava o frame no slot ativo", async () => {
    const fake = new FakeController();
    const pad = new Cyclone2(fake);
    await pad.setStaticColor({ Home: "#ff0000", LowerLeft: [0, 0, 255] });
    const bytes = fake.profiles.get(Profile.Light) ?? new Uint8Array();
    const frame0 = LightOffset.animation(0) + 4;
    expect(Array.from(bytes.slice(frame0, frame0 + 15))).toEqual([0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0]);
    expect(bytes[LightOffset.animation(0)]).toBe(1);
  });

  it("reenvia quando o controle não responde", async () => {
    const fake = new FakeController();
    fake.dropNext = 2;
    const pad = new Cyclone2(fake);
    const fw = await pad.readFirmwareVersion();
    expect(fw.firmware).toBe("1.2.3");
    expect(fake.written).toHaveLength(3);
  });

  it("aviso de mudança no perfil atual invalida o cache", async () => {
    const fake = new FakeController();
    const pad = new Cyclone2(fake);
    const original = await pad.readGameProfile(1);
    fake.profiles.get(Profile.P1)?.fill(7, 176, 186);
    fake.notify([Cmd.ProfileChanged, Profile.Current, 0, 0, 0, 0]);
    await pad.writeGameProfile(1, original);
    expect(Array.from(fake.profiles.get(Profile.P1)?.slice(176, 186) ?? [])).toEqual(new Array(10).fill(0));
  });

  it("remapeia um botão no perfil de jogo", async () => {
    const fake = new FakeController();
    const pad = new Cyclone2(fake);
    await pad.remapButton(1, "A", 10);
    const a = (await pad.readGameProfile(1)).buttons.A;
    expect(a.mapEnabled).toBe(true);
    expect(a.mapTo).toEqual([10, 0, 0]);
  });
});
