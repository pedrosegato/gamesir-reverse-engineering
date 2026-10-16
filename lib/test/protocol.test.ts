import { describe, expect, it } from "vitest";
import { Cmd, LIGHT_PROFILE_SIZE, protocol as P, Profile } from "../src/index.js";

const head = (pkt: Uint8Array, n = 8) => Array.from(pkt.slice(0, n));

describe("pacotes", () => {
  it("sempre 64 bytes, começando com 0x0F", () => {
    for (const pkt of [P.heartbeat(), P.readFwVersion(), P.vibrate(255, 0), P.switchProfile(2)]) {
      expect(pkt).toHaveLength(64);
      expect(pkt[0]).toBe(0x0f);
    }
  });

  it("comandos simples iguais aos do app", () => {
    expect(head(P.heartbeat(), 3)).toEqual([15, 242, 0]);
    expect(head(P.heartbeat(true), 3)).toEqual([15, 242, 1]);
    expect(head(P.readFwVersion(), 2)).toEqual([15, 9]);
    expect(head(P.readCurrentProfile(), 2)).toEqual([15, 11]);
    expect(head(P.switchProfile("Shift"), 3)).toEqual([15, 7, 5]);
    expect(head(P.vibrate(200, 100), 6)).toEqual([15, 32, 102, 85, 200, 100]);
    expect(head(P.setLightStatus(true, 3), 4)).toEqual([15, 13, 1, 3]);
    expect(head(P.setMacroRecord(2, 1), 4)).toEqual([15, 22, 2, 1]);
    expect(head(P.quickUpdate(), 4)).toEqual([15, 23, 85, 136]);
  });

  it("leitura do perfil de luz em 11 blocos de até 58 bytes", () => {
    const pkts = P.readProfile(Profile.Light, LIGHT_PROFILE_SIZE);
    expect(pkts).toHaveLength(Math.ceil(635 / 58));
    expect(head(pkts[0], 6)).toEqual([15, 4, 32, 0, 0, 58]);
    expect(head(pkts[4], 6)).toEqual([15, 4, 32, 0, 232, 58]);
    expect(head(pkts[pkts.length - 1], 6)).toEqual([15, 4, 32, 2, 68, 635 - 580]);
  });

  it("escrita em blocos com offset", () => {
    const data = Array.from({ length: 70 }, (_, i) => i);
    const pkts = P.writeProfile(Profile.P1, data, 600);
    expect(pkts).toHaveLength(2);
    expect(head(pkts[0], 7)).toEqual([15, 3, 1, 2, 88, 58, 0]);
    expect(head(pkts[1], 7)).toEqual([15, 3, 1, 2, 146, 12, 58]);
  });

  it("interpreta respostas", () => {
    const ack = [15, Cmd.Ack, 1];
    expect(P.isBusyAck(ack)).toBe(true);
    const chunk = P.parseProfileChunk([15, 5, 32, 1, 2, 3, 9, 8, 7, 0, 0]);
    expect(chunk.profileNum).toBe(32);
    expect(chunk.offset).toBe(258);
    expect(Array.from(chunk.data)).toEqual([9, 8, 7]);
    expect(P.parseProfileChange([15, 15, 32, 0, 1, 0, 124])).toEqual({ profileNum: 32, offset: 1, length: 124 });
    expect(P.parseResponse([0x10, Cmd.ReadFwVersionAck])?.cmd).toBe(Cmd.ReadFwVersionAck);
    expect(P.parseResponse([0x12, Cmd.Ack])).toBeNull();
  });
});
