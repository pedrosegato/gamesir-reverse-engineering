import { type BackButton, type Buttons, keyName, type MacroStep } from "../src/index.js";

export const pressed = (b: Buttons) =>
  Object.entries(b)
    .filter(([, down]) => down)
    .map(([name]) => name)
    .join(" ") || "-";

export const describeMacro = (steps: MacroStep[]) =>
  steps.map((s) => `${keyName(s.key) ?? s.key} ${s.holdMs}/${s.delayMs} ms`).join(", ") || "(vazia)";

const keyList = (keys: number[]) =>
  keys
    .filter(Boolean)
    .map((k) => keyName(k) ?? k)
    .join(" + ");

export function describeBackButton({ macro, mapEnabled, mapTo }: BackButton): string {
  if (macro.enabled) {
    const mode = [macro.holdToTrigger ? "Long Press" : "Single Press", macro.loop ? `loop ${macro.loopMs} ms` : ""];
    return `macro (${mode.filter(Boolean).join(", ")}): ${describeMacro(macro.steps)}`;
  }
  if (mapEnabled) return `mapeado para ${keyList(mapTo)}`;
  return "sem mapeamento";
}
