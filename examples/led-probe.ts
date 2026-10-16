import { createInterface } from "node:readline/promises";
import { Cyclone2, type LightProfile, STATE_REPORT_ID } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";

/** Another model keeps DockLedMode and DockLedBrightness right after StandbyTime, where the Cyclone 2 has reserved bytes. */
const RESERVED_TRIALS: readonly { readonly index: number; readonly values: readonly number[] }[] = [
  { index: 0, values: [0, 1, 2] },
  { index: 1, values: [10, 100, 0] },
];

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex").replace(/(..)/g, "$1 ").trim();

/** Every value seen per state-report byte, plus the distinct reports of other kinds. */
function capture(pad: Cyclone2) {
  const values = Array.from({ length: 64 }, () => new Set<number>());
  const others = new Set<string>();
  const off = pad.onRaw((raw) => {
    if (raw[0] === STATE_REPORT_ID) {
      for (const [i, b] of raw.entries()) values[i]?.add(b);
    } else if (others.size < 20) others.add(hex(raw));
  });
  return { values, others, stop: off };
}

type Capture = ReturnType<typeof capture>;

function differences(normal: Capture, test: Capture): string[] {
  const lines = test.values.flatMap((seen, i) => {
    const fresh = [...seen].filter((v) => !normal.values[i].has(v));
    if (fresh.length === 0) return [];
    return [`  byte ${i}: normal ${[...normal.values[i]].join(",") || "-"} → teste ${[...seen].join(",")}`];
  });
  const reports = [...test.others].filter((r) => !normal.others.has(r)).map((r) => `  outro report: ${r}`);
  return [...lines, ...reports];
}

const [found] = await findControllers();
if (!found) throw new Error("no controller found");
const pad = new Cyclone2(await NodeHidTransport.open(found.path));
const original: LightProfile = await pad.readLightProfile();
const prompt = createInterface({ input: process.stdin, output: process.stdout });
prompt.on("SIGINT", () => prompt.close());
const notes: string[] = [];
const ask = async (step: string) => {
  const answer = await prompt.question(`${step}: `);
  notes.push(`${step}: ${answer || "-"}`);
};

try {
  await prompt.question("Teste 1, modo teste do heartbeat. Fora da dock, sem tocar no controle, tecle Enter.");
  const normal = capture(pad);
  await pad.start();
  await new Promise((r) => setTimeout(r, 5000));
  normal.stop();

  const test = capture(pad);
  await pad.start({ testMode: true });
  await ask("1. modo teste ligado: olhe a coluna do meio, o Home e as laterais, descreva e tecle Enter");
  test.stop();
  await pad.start();
  pad.stopHeartbeat();
  const changed = differences(normal, test);
  notes.push(changed.length ? `   state report no modo teste:\n${changed.join("\n")}` : "   state report igual");

  await prompt.question("\nTeste 2, bytes reservados da luz. Coloque o controle na dock e tecle Enter.");
  console.log(`reservados: ${original.reserved.join(" ")}`);
  let step = 2;
  for (const { index, values } of RESERVED_TRIALS) {
    for (const value of values.filter((v) => v !== original.reserved[index])) {
      await pad.writeLightProfile({
        ...original,
        reserved: original.reserved.map((b, i) => (i === index ? value : b)),
      });
      await ask(`${step++}. reservado[${index}] = ${value}`);
    }
    await pad.writeLightProfile(original);
  }
} catch (error) {
  if ((error as Error).name !== "AbortError") throw error;
} finally {
  prompt.close();
  pad.stopHeartbeat();
  await pad.writeLightProfile(original);
  await pad.close();
  console.log(`\nLuz restaurada. Resumo:\n${notes.join("\n")}`);
}
