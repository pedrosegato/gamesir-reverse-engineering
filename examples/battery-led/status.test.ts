import { describe, expect, it } from "vitest";
import { type BatteryStatus, classify, HYSTERESIS, indicatorKey } from "./status.js";

const onBattery = (percent: number, previous?: BatteryStatus) => classify({ percent, powered: false }, previous);

describe("classify", () => {
  it("no cabo: carregando até 100 %, depois carregada", () => {
    expect(classify({ percent: 57, powered: true })).toEqual({ kind: "charging", percent: 57 });
    expect(classify({ percent: 100, powered: true })).toEqual({ kind: "charged" });
  });

  it.each([
    [5, "critical"],
    [9, "critical"],
    [10, "low"],
    [25, "low"],
    [26, "medium"],
    [50, "medium"],
    [75, "good"],
    [76, "high"],
    [100, "high"],
  ])("%i %% na bateria → %s", (percent, level) => {
    expect(indicatorKey(onBattery(percent))).toBe(level);
  });

  it("segura a faixa enquanto a leitura oscila perto da borda", () => {
    const medium = onBattery(26);
    expect(indicatorKey(onBattery(25, medium))).toBe("medium");
    expect(indicatorKey(onBattery(26 - HYSTERESIS, medium))).toBe("medium");
    expect(indicatorKey(onBattery(25 - HYSTERESIS, medium))).toBe("low");
  });

  it("sair do cabo recalcula a faixa do zero", () => {
    expect(indicatorKey(onBattery(80, { kind: "charged" }))).toBe("high");
  });
});
