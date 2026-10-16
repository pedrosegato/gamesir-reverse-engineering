import { type GameProfile, type GameProfileNumber, KeyCode, ReportRate } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const REMAP_SECONDS = 15;
const HZ: Record<number, number> = { [ReportRate.Hz250]: 250, [ReportRate.Hz500]: 500, [ReportRate.Hz1000]: 1000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [command] = process.argv.slice(2);
const pad = await openFirstCyclone2();
const profile = (await pad.readCurrentProfile()) as GameProfileNumber;
console.log(`perfil ativo: ${profile === 5 ? "Shift" : profile}`);

let pendingRestore: GameProfile | null = null;

async function restore(): Promise<void> {
  if (!pendingRestore) return;
  await pad.writeGameProfile(profile, pendingRestore);
  pendingRestore = null;
  console.log("perfil restaurado");
}

async function statesPerSecond(ms = 2000): Promise<number> {
  let count = 0;
  const off = pad.onState(() => count++);
  await sleep(ms);
  off();
  return Math.round((count * 1000) / ms);
}

async function testReportRate(): Promise<void> {
  const original = await pad.readGameProfile(profile);
  const from = original.fun.reportRate;
  const to = from === ReportRate.Hz1000 ? ReportRate.Hz250 : ReportRate.Hz1000;
  console.log(`atual ${HZ[from]} Hz, reports 0x12/s: ${await statesPerSecond()}`);

  pendingRestore = original;
  await pad.setReportRate(profile, to);
  const readBack = (await pad.readGameProfile(profile)).fun.reportRate;
  await sleep(500);
  console.log(`gravado ${HZ[to]} Hz, lido de volta ${HZ[readBack]} Hz, reports 0x12/s: ${await statesPerSecond()}`);

  await restore();
  const restored = (await pad.readGameProfile(profile)).fun.reportRate;
  console.log(`lido após restaurar: ${HZ[restored]} Hz`);
  console.log(readBack === to && restored === from ? "OK" : "FALHOU");
}

async function testRemap(): Promise<void> {
  pendingRestore = await pad.readGameProfile(profile);
  await pad.remapButton(profile, "A", KeyCode.B);
  console.log(`A → B por ${REMAP_SECONDS} s (só o A muda; B continua B). Aperte A, depois B.`);

  let last = "";
  const off = pad.onState((s) => {
    const { A, B } = s.buttons;
    const line = `mapeado: A=${+A} B=${+B} | físico: A=${+s.physical.buttons.A} B=${+s.physical.buttons.B}`;
    if (line === last) return;
    last = line;
    console.log(line);
  });
  await sleep(REMAP_SECONDS * 1000);
  off();

  await restore();
  const a = (await pad.readGameProfile(profile)).buttons.A;
  console.log(`A após restaurar: mapEnabled=${a.mapEnabled} mapTo=${a.mapTo.join(",")}`);
}

process.on("SIGINT", async () => {
  await restore();
  await pad.close();
  process.exit(0);
});

switch (command) {
  case "rate":
    await testReportRate();
    break;
  case "remap":
    await testRemap();
    break;
  default:
    console.log("uso: game-profile.ts rate | remap");
}

await pad.close();
