import { Cmd, type GameProfile, type GameProfileNumber, Profile, protocol, STATE_REPORT_ID } from "gamesir-hid";
import { describeBackButton } from "./_format.js";
import { openFirstCyclone2 } from "./_open.js";

const RECORD_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (b: Uint8Array, n = 16) => Buffer.from(b.slice(0, n)).toString("hex").replace(/(..)/g, "$1 ").trim();

const pad = await openFirstCyclone2();
const profile = (await pad.readCurrentProfile()) as GameProfileNumber;
const profileName = profile === 5 ? "Shift" : profile;
console.log(`perfil ativo: ${profileName}`);

let pendingRestore: GameProfile | null = await pad.readGameProfile(profile);
let recording = false;

async function restore(): Promise<void> {
  if (recording) await pad.setMacroRecording("L4", protocol.MacroRecordState.Cancel);
  recording = false;
  if (!pendingRestore) return;
  await pad.readProfile(profile);
  await pad.writeGameProfile(profile, pendingRestore);
  pendingRestore = null;
  console.log("perfil restaurado");
}

async function capture(label: string, action: () => Promise<unknown>, settleMs = 400): Promise<void> {
  const seen: string[] = [];
  const off = pad.onRaw((raw) => {
    if (raw[0] !== STATE_REPORT_ID) seen.push(hex(raw));
  });
  try {
    await action();
  } catch (e) {
    seen.push(`erro: ${(e as Error).message}`);
  }
  await sleep(settleMs);
  off();
  console.log(`${label}:`);
  for (const line of seen.length ? seen : ["(nada)"]) console.log(`  ← ${line}`);
}

async function recordThen(action: "Stop" | "Cancel"): Promise<void> {
  const before = (await pad.readGameProfile(profile)).L4;
  console.log(
    `\n[${action}] em 3 s: quando aparecer "gravando", aperte A, B, X, Y sem parar (uns 2 por segundo) até aparecer "fim".`,
  );
  await sleep(3000);

  const start = Date.now();
  const at = () => `${String(Date.now() - start).padStart(5)} ms`;
  let flag = false;
  const offState = pad.onState((s) => {
    if (s.macroRecording === flag) return;
    flag = s.macroRecording;
    console.log(`${at()}  ${flag ? "gravando" : "parou de gravar"}`);
  });
  const offChange = pad.onProfileChanged((c) =>
    console.log(`${at()}  aviso: perfil ${c.profileNum} mudou (offset ${c.offset}, ${c.length} B)`),
  );

  recording = true;
  await pad.setMacroRecording("L4", protocol.MacroRecordState.Start);
  await sleep(RECORD_MS);
  console.log(`${at()}  enviando ${action} (0F 16 01 ${protocol.MacroRecordState[action]})`);
  await pad.setMacroRecording("L4", protocol.MacroRecordState[action]);
  recording = false;
  await sleep(2500);
  offState();
  offChange();
  console.log("fim");

  console.log(`L4 antes:  ${describeBackButton(before)}`);
  console.log(`L4 depois: ${describeBackButton((await pad.readGameProfile(profile)).L4)}`);
}

process.on("SIGINT", async () => {
  await restore();
  await pad.close();
  process.exit(0);
});

const light = await pad.readProfile(Profile.Light);
await capture("WriteProfile (regrava o ConfigIndex com o mesmo valor)", () =>
  pad.writeProfile(Profile.Light, [light[0]], 0),
);

const other = profile === 1 ? 2 : 1;
await capture(`SwitchProfile ${other}`, () => pad.switchProfile(other));
await capture(`SwitchProfile ${profileName} (volta)`, () => pad.switchProfile(profile === 5 ? "Shift" : profile));

await capture("device info (0F 04 n 03 9D 07)", () =>
  pad.request(protocol.packet(Cmd.ReadProfile, profile, 0x03, 0x9d, 7), {
    maxSends: 2,
    timeoutMs: 500,
    match: (r) => r[1] === Cmd.ReadProfileAck,
  }),
);

await recordThen("Stop");
await recordThen("Cancel");

await restore();
await pad.close();
