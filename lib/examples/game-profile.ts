import {
  type Buttons,
  type GameProfile,
  type GameProfileNumber,
  KeyCode,
  keyName,
  type MacroStep,
  protocol,
  ReportRate,
} from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const WATCH_SECONDS = 15;
const RECORD_SECONDS = 10;
const HZ: Record<number, number> = { [ReportRate.Hz250]: 250, [ReportRate.Hz500]: 500, [ReportRate.Hz1000]: 1000 };

const TEST_MACRO: MacroStep[] = [
  { key: KeyCode.A, holdMs: 200, delayMs: 300 },
  { key: KeyCode.B, holdMs: 200, delayMs: 300 },
  { key: KeyCode.X, holdMs: 200, delayMs: 300 },
  { key: KeyCode.Y, holdMs: 200, delayMs: 0 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const [command] = process.argv.slice(2);
const pad = await openFirstCyclone2();
const profile = (await pad.readCurrentProfile()) as GameProfileNumber;
console.log(`perfil ativo: ${profile === 5 ? "Shift" : profile}`);

let pendingRestore: GameProfile | null = null;
let recording = false;

async function restore(): Promise<void> {
  if (recording) await pad.setMacroRecording("FL1", protocol.MacroRecordState.Cancel);
  recording = false;
  if (!pendingRestore) return;
  await pad.readProfile(profile);
  await pad.writeGameProfile(profile, pendingRestore);
  pendingRestore = null;
  console.log("perfil restaurado");
}

const pressed = (b: Buttons) =>
  Object.entries(b)
    .filter(([, down]) => down)
    .map(([name]) => name)
    .join(" ") || "-";

const describeMacro = (steps: MacroStep[]) =>
  steps.map((s) => `${keyName(s.key) ?? s.key} ${s.holdMs}/${s.delayMs} ms`).join(", ") || "(vazia)";

/** Imprime físico × saída a cada mudança, com o tempo desde o início. */
async function watch(seconds: number): Promise<void> {
  const start = Date.now();
  let last = "";
  const off = pad.onState((s) => {
    const rec = s.macroRecording ? ` | gravando ${s.macroRecordKey ?? "?"}` : "";
    const line = `físico: ${pressed(s.physical.buttons)} | saída: ${pressed(s.buttons)}${rec}`;
    if (line === last) return;
    last = line;
    console.log(`${String(Date.now() - start).padStart(6)} ms  ${line}`);
  });
  await sleep(seconds * 1000);
  off();
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
  console.log(`A → B por ${WATCH_SECONDS} s (só o A muda; B continua B). Aperte A, depois B.`);
  await watch(WATCH_SECONDS);
  await restore();
}

async function testMacro(): Promise<void> {
  pendingRestore = await pad.readGameProfile(profile);
  await pad.updateGameProfile(profile, (p) => {
    p.L4 = {
      ...p.L4,
      mapEnabled: false,
      mapTo: [0, 0, 0],
      macro: { enabled: true, holdToTrigger: false, loop: false, loopMs: 0, steps: TEST_MACRO },
    };
    return p;
  });
  const saved = (await pad.readGameProfile(profile)).L4.macro;
  console.log(`L4 gravado: ${describeMacro(saved.steps)}`);
  console.log(`por ${WATCH_SECONDS} s: aperte e solte o L4 uma vez, espere a sequência, repita.`);
  await watch(WATCH_SECONDS);
  await restore();
}

async function testRecord(): Promise<void> {
  pendingRestore = await pad.readGameProfile(profile);
  const offChange = pad.onProfileChanged((c) =>
    console.log(`aviso do controle: perfil ${c.profileNum} mudou (offset ${c.offset}, ${c.length} B)`),
  );

  recording = true;
  await pad.setMacroRecording("FL1", protocol.MacroRecordState.Start);
  console.log(`gravando macro no L4 por ${RECORD_SECONDS} s: aperte A, B e X, um de cada vez.`);
  await watch(RECORD_SECONDS);
  await pad.setMacroRecording("FL1", protocol.MacroRecordState.Stop);
  recording = false;
  await sleep(1000);
  offChange();

  const { macro } = (await pad.readGameProfile(profile)).L4;
  console.log(`macro gravada (enabled=${macro.enabled}): ${describeMacro(macro.steps)}`);
  console.log(`por ${WATCH_SECONDS} s: aperte e solte o L4 pra tocar a macro gravada.`);
  await watch(WATCH_SECONDS);
  await restore();
}

process.on("SIGINT", async () => {
  await restore();
  await pad.close();
  process.exit(0);
});

const tests: Record<string, () => Promise<void>> = {
  rate: testReportRate,
  remap: testRemap,
  macro: testMacro,
  record: testRecord,
};

const run = tests[command];
if (run) await run();
else console.log(`uso: game-profile.ts ${Object.keys(tests).join(" | ")}`);

await pad.close();
