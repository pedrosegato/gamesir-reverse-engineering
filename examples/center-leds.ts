import { createInterface } from "node:readline/promises";
import { animation, CHARGING_ANIMATION, Cyclone2, type FrameInput, type LightProfile, toRgb } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const SLOT = 3;
const WHITE = "#ffffff";

interface Step {
  readonly description: string;
  readonly apply: (pad: Cyclone2, original: LightProfile) => Promise<void>;
}

const withFrame = (original: LightProfile, frame: FrameInput): LightProfile => ({
  ...original,
  activeAnimation: SLOT,
  animations: original.animations.map((a, i) => (i === SLOT ? animation([frame]) : a)),
});

const STEPS: Step[] = [
  {
    description: "Home verde, o resto apagado",
    apply: (pad, original) => pad.writeLightProfile(withFrame(original, { Home: "#00ff00" })),
  },
  {
    description: "UpperRight branco, o resto apagado",
    apply: (pad, original) => pad.writeLightProfile(withFrame(original, { UpperRight: WHITE })),
  },
  {
    description: "UpperRight branco e a cor de perfil (profileLed) vermelha",
    apply: (pad, original) =>
      pad.writeLightProfile({ ...withFrame(original, { UpperRight: WHITE }), profileLed: toRgb("#ff0000") }),
  },
  {
    description: "UpperLeft azul, o resto apagado",
    apply: (pad, original) => pad.writeLightProfile(withFrame(original, { UpperLeft: "#0000ff" })),
  },
  {
    description: "animação de carga ativa, fora da dock",
    apply: (pad, original) => pad.writeLightProfile({ ...original, activeAnimation: CHARGING_ANIMATION }),
  },
  ...([1, 2, 3, 4] as const).map(
    (profile): Step => ({
      description: `perfil ${profile} ativo, UpperRight branco`,
      apply: async (pad, original) => {
        await pad.writeLightProfile(withFrame(original, { UpperRight: WHITE }));
        await pad.switchProfile(profile);
      },
    }),
  ),
];

const [found] = await findControllers();
if (!found) throw new Error("no controller found");
const pad = new Cyclone2(await NodeHidTransport.open(found.path));
const original = await pad.readLightProfile();
const profile = await pad.readCurrentProfile();
const prompt = createInterface({ input: process.stdin, output: process.stdout });
prompt.on("SIGINT", () => prompt.close());
const seen: string[] = [];

console.log("Olhe a coluna de LEDs do meio, descreva o que aparece e tecle Enter.\n");
try {
  for (const [i, step] of STEPS.entries()) {
    await step.apply(pad, original);
    const answer = await prompt.question(`${i + 1}/${STEPS.length} ${step.description}: `);
    seen.push(`${i + 1}. ${step.description}: ${answer || "-"}`);
  }
} finally {
  prompt.close();
  await pad.switchProfile(profile === 5 ? "Shift" : (profile as 1 | 2 | 3 | 4));
  await pad.writeLightProfile(original);
  await pad.close();
  console.log(`\nLuz e perfil restaurados. Resumo:\n${seen.join("\n")}`);
}
