import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeGameProfile,
  decodeLightProfile,
  encodeGameProfile,
  encodeLightProfile,
  protocol as P,
  parseState,
} from "../src/index.js";

const dump = JSON.parse(readFileSync(new URL("./fixtures/dump-dongle-fw346.json", import.meta.url), "utf8"));
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));

describe("dump real do controle", () => {
  it("versão de firmware", () => {
    const v = P.parseFirmwareVersion(bytes(dump.firmwareRaw));
    expect([v.firmware, v.dongle]).toEqual(["3.4.6", "1.2.1"]);
  });

  it.each(["P1", "P2", "P3", "P4", "Shift"])("perfil de jogo %s: ida e volta idêntica", (name) => {
    const raw = bytes(dump[name]);
    expect(encodeGameProfile(decodeGameProfile(raw))).toEqual(raw);
  });

  it("valores do perfil de jogo batem com os padrões do app", () => {
    const p1 = decodeGameProfile(bytes(dump.P1));
    const p2 = decodeGameProfile(bytes(dump.P2));
    expect(p1.fun.motors).toMatchObject({ left: 75, right: 75 });
    expect([p1.fun.reportRate, p2.fun.reportRate]).toEqual([0, 2]);
    expect(p2.LT.deadzone).toMatchObject({ start: 5, end: 95 });
    expect(p1.gyroAim.activationKey).toBe(255);
    expect(p1.gyroTilt.map.output).toBe(2);
  });

  it("perfil de luz: ida e volta idêntica e Home no slot 3", () => {
    const raw = bytes(dump.Light);
    const light = decodeLightProfile(raw);
    expect(encodeLightProfile(light)).toEqual(raw);
    expect(light.animations[0].frames[0].Home).toEqual({ r: 80, g: 255, b: 0 });
    expect(light.standbyTime).toBe(10);
  });

  it("report de estado capturado", () => {
    const captured =
      "12 80 80 80 80 0f 00 00 00 00 20 59 00 07 00 01 00 04 00 1f 02 97 1f e3 ff 00 00 00 00 00 00 00 00 00 00 00 " +
      "35 00 50 ff 00 00 00 00 00 00 00 00 00 00 00 00 00 00 7d 7a 86 80 0f 00 00 00 00 00";
    const s = parseState(bytes(captured.replace(/ /g, "")));
    expect(s.batteryLevel).toBe(0x35);
    expect(s.hat).toBeNull();
    expect(s.leds.Home).toEqual({ r: 80, g: 255, b: 0 });
    expect(s.leftStick).toEqual({ x: 0, y: 0 });
    expect(s.physical.leftStick).toEqual({ x: -0.0234, y: -0.0469 });
    expect(s.physical.hat).toBeNull();
    expect(s.imu).toEqual({ counter: 89, gyro: { x: 7, y: 1, z: 4 }, accel: { x: 543, y: 8087, z: -29 } });
  });
});
