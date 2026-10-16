import { createInterface } from "node:readline/promises";
import { animation, Cyclone2, protocol } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

const SLOT = 3;

/**
 * Sweeps the light-status command `0F 0D <playing> <arg>`, the only display command the app sends that the app
 * never uses beyond frames 1..8. Display only: it plays frames of the active animation, it does not write the
 * profile or EEPROM, so it cannot change saved settings. Looking for an arg that drives the center column.
 */
const [found] = await findControllers();
if (!found) throw new Error("no controller found");
const pad = new Cyclone2(await NodeHidTransport.open(found.path));
const original = await pad.readLightProfile();

// A distinct per-zone frame so any column reaction stands out from Home.
await pad.setAnimation(animation([{ Home: "#003300", UpperRight: "#ffffff" }]), { slot: SLOT });

const prompt = createInterface({ input: process.stdin, output: process.stdout });
prompt.on("SIGINT", () => prompt.close());
const seen: string[] = [];

console.log("Olhe a coluna do meio. Em cada passo, descreva o que faz e tecle Enter (vazio = nada muda).\n");
try {
  for (let playing = 0; playing <= 1; playing++) {
    for (let arg = 0; arg <= 16; arg++) {
      await pad.send(protocol.setLightStatus(playing === 1, arg));
      const label = `0F 0D ${playing} ${arg}`;
      const answer = await prompt.question(`${label}: `);
      if (answer.trim()) seen.push(`${label} -> ${answer.trim()}`);
    }
  }
} finally {
  prompt.close();
  await pad.playLights();
  await pad.writeLightProfile(original);
  await pad.close();
  console.log(`\nLuz restaurada.\nPassos com reação:\n${seen.length ? seen.join("\n") : "(nenhum)"}`);
}
