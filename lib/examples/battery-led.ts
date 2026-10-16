import { type Animation, animation, applyPreset, type ColorInput } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

/** Usa o slot 4 de animação (índice 3) para não sobrescrever os outros três. */
const SLOT = 3;

const homeOnly = (color: ColorInput) => animation([{ Home: color }]);

function batteryAnimation(level: number, charging: boolean): { key: string; anim: Animation } {
  if (charging && level >= 100) return { key: "cheia", anim: homeOnly("#ffffff") };
  if (charging) return { key: "carregando", anim: applyPreset(animation([{}]), "Rainbow") };
  if (level < 10) return { key: "crítica", anim: applyPreset(animation([{}]), "Alarm") };
  if (level <= 25) return { key: "baixa", anim: homeOnly("#ff0000") };
  if (level <= 50) return { key: "média-baixa", anim: homeOnly("#ffb400") };
  if (level <= 75) return { key: "média", anim: homeOnly("#50ff00") };
  return { key: "alta", anim: homeOnly("#00ff00") };
}

const pad = await openFirstCyclone2();
let current = "";
let busy = false;

pad.onState(async (s) => {
  const { key, anim } = batteryAnimation(s.batteryLevel, s.chargeState === 1);
  if (key === current || busy) return;
  busy = true;
  try {
    await pad.setAnimation(anim, { slot: SLOT });
    current = key;
    console.log(`bateria ${s.batteryLevel}%${s.chargeState === 1 ? " carregando" : ""} → ${key}`);
  } finally {
    busy = false;
  }
});

process.on("SIGINT", async () => {
  await pad.close();
  process.exit(0);
});
