import { describe, expect, it } from "vitest";
import {
  decodeGameProfile,
  encodeGameProfile,
  GAME_PROFILE_SIZE,
  GameProfileOffset,
  KeyCode,
  keyName,
  MAPPED_BUTTONS,
  protocol as P,
} from "../src/index.js";

function blankImage(): Uint8Array {
  return new Uint8Array(GAME_PROFILE_SIZE);
}

describe("game profile", () => {
  it("round trip of an all-zero profile", () => {
    expect(encodeGameProfile(decodeGameProfile(blankImage()))).toEqual(blankImage());
  });

  it("fields land on the app offsets", () => {
    const img = blankImage();
    img.set(new TextEncoder().encode("Perfil 1"), GameProfileOffset.Name);
    img[GameProfileOffset.ReportRate] = 2;
    const aOffset = GameProfileOffset.Buttons + MAPPED_BUTTONS.indexOf("A") * 7;
    img.set([1, 15, 1, KeyCode.B, 0, 0, 1], aOffset);
    img[GameProfileOffset.LT + 12] = 0x82;
    img[GameProfileOffset.LeftStick + 25] = 4;
    img[GameProfileOffset.GyroTilt] = 3;

    const p = decodeGameProfile(img);
    expect(p.name).toBe("Perfil 1");
    expect(p.fun.reportRate).toBe(2);
    expect(p.buttons.A).toEqual({
      turboEnabled: true,
      turboSpeed: 15,
      mapEnabled: true,
      mapTo: [10, 0, 0],
      toggle: true,
    });
    expect(p.LT.hairTrigger).toEqual({ enabled: true, mode: 2, start: 0, end: 0 });
    expect(p.leftStick.map.output).toBe(4);
    expect(p.gyroTilt.activation).toBe(3);
    expect(encodeGameProfile(p)).toEqual(img);
  });

  it("macro: big-endian steps, the 30th without delay", () => {
    const p = decodeGameProfile(blankImage());
    p.L4.macro = {
      enabled: true,
      holdToTrigger: false,
      loop: true,
      loopMs: 500,
      steps: [
        { key: KeyCode.A, holdMs: 100, delayMs: 300 },
        { key: KeyCode.B, holdMs: 0x0102, delayMs: 0 },
      ],
    };
    const img = encodeGameProfile(p);
    const m = GameProfileOffset.L4 + 7;
    expect(Array.from(img.slice(m, m + 9))).toEqual([0b101, 0x01, 0xf4, 2, KeyCode.A, 0, 100, 0x01, 0x2c]);
    expect(Array.from(img.slice(m + 9, m + 12))).toEqual([KeyCode.B, 1, 2]);
    expect(decodeGameProfile(img).L4.macro).toEqual(p.L4.macro);
  });

  it("rejects a name that does not fit with the terminator", () => {
    const p = decodeGameProfile(blankImage());
    p.name = "x".repeat(32);
    expect(() => encodeGameProfile(p)).toThrow();
  });
});

describe("key codes", () => {
  it("match the app table", () => {
    expect(KeyCode.A).toBe(9);
    expect(KeyCode.L4).toBe(17);
    expect(KeyCode.KeyW).toBe(79);
    expect(KeyCode.MouseButton4).toBe(204);
    expect(KeyCode.Shift).toBe(231);
    expect(keyName(255)).toBe("None");
  });
});

describe("firmware version", () => {
  it("each character becomes a component", () => {
    const raw = new Uint8Array(64);
    raw.set([0x0f, 0x0a]);
    raw.set(new TextEncoder().encode("123"), 4);
    raw.set(new TextEncoder().encode("121"), 12);
    const v = P.parseFirmwareVersion(raw);
    expect(v.firmware).toBe("1.2.3");
    expect(v.dongle).toBe("1.2.1");
  });
});
