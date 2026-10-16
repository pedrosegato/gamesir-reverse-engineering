import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Cyclone2, type LightProfile } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

/** Another model keeps DockLedMode and DockLedBrightness right after StandbyTime, where the Cyclone 2 has reserved bytes. */
const TRIALS: readonly { readonly index: number; readonly values: readonly number[] }[] = [
  { index: 0, values: [0, 1, 2] },
  { index: 1, values: [10, 100] },
];

/** The dock turns the controller off, so the original bytes stay on disk until they are written back. */
const JOURNAL = join(tmpdir(), "gamesir-led-probe.json");

interface Connected {
  readonly pad: Cyclone2;
  readonly light: LightProfile;
}

async function tryOpen(path: string): Promise<Connected | null> {
  const pad = await NodeHidTransport.open(path)
    .then((transport) => new Cyclone2(transport))
    .catch(() => null);
  if (!pad) return null;
  try {
    return { pad, light: await pad.readLightProfile() };
  } catch {
    await pad.close().catch(() => undefined);
    return null;
  }
}

/** Waits until the controller is on and answers. */
async function connect(): Promise<Connected> {
  let announced = false;
  for (;;) {
    const [found] = await findControllers();
    const connected = found && (await tryOpen(found.path));
    if (connected) return connected;
    if (!announced) console.log("esperando o controle ligar…");
    announced = true;
    await sleep(1000);
  }
}

async function writeReserved(reserved: readonly number[]): Promise<void> {
  const { pad, light } = await connect();
  try {
    await pad.writeLightProfile({ ...light, reserved: [...reserved] });
  } finally {
    await pad.close();
  }
}

if (existsSync(JOURNAL)) {
  await writeReserved(JSON.parse(readFileSync(JOURNAL, "utf8")));
  rmSync(JOURNAL);
  console.log("bytes da execução interrompida restaurados");
} else {
  const first = await connect();
  const original = first.light.reserved;
  await first.pad.close();
  writeFileSync(JOURNAL, JSON.stringify(original));
  console.log(`reservados: ${original.join(" ")}`);
  console.log("Em cada passo: ponha na dock, olhe a coluna, descreva, tire da dock, ligue o controle e tecle Enter.\n");

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  prompt.on("SIGINT", () => prompt.close());
  const notes: string[] = [];
  try {
    let step = 1;
    for (const { index, values } of TRIALS) {
      for (const value of values.filter((v) => v !== original[index])) {
        await writeReserved(original.map((b, i) => (i === index ? value : b)));
        const label = `${step++}. reservado[${index}] = ${value}`;
        notes.push(`${label}: ${(await prompt.question(`${label}: `)) || "-"}`);
      }
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") throw error;
  } finally {
    prompt.close();
    await writeReserved(original);
    rmSync(JOURNAL);
    console.log(`\nBytes restaurados. Resumo:\n${notes.join("\n")}`);
  }
}
