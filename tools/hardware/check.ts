import { Cyclone2, Cyclone2Pid, type Cyclone2State, DONGLE_IDLE_PID, Profile, VENDOR_ID } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import HID from "node-hid";

const MODES: Record<number, string> = {
  [Cyclone2Pid.Wired]: "cabo",
  [Cyclone2Pid.WiredAdc]: "cabo (ADC)",
  [Cyclone2Pid.Wireless]: "sem fio",
  [Cyclone2Pid.WirelessDongle]: "dongle",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex4 = (n = 0) => `0x${n.toString(16).padStart(4, "0")}`;
const hex = (b: Uint8Array, n: number) => Buffer.from(b.slice(0, n)).toString("hex").replace(/(..)/g, "$1 ").trim();
const rgb = ({ r, g, b }: { r: number; g: number; b: number }) => `${r},${g},${b}`;

async function listCandidates(): Promise<void> {
  const all = await HID.devicesAsync();
  const gamesir = all.filter((d) => d.vendorId === VENDOR_ID);
  const looksLikePad = all.filter((d) => /game|xbox|controller|pad/i.test(`${d.manufacturer} ${d.product}`));
  console.log("nenhuma coleção 0xFFF0 de Cyclone 2. Dispositivos parecidos:");
  for (const d of new Set([...gamesir, ...looksLikePad])) {
    console.log(
      `  VID ${hex4(d.vendorId)} PID ${hex4(d.productId)} interface ${d.interface} usagePage ${hex4(d.usagePage)} ${d.manufacturer ?? ""} ${d.product ?? ""}`,
    );
  }
}

async function statesPerSecond(pad: Cyclone2, ms = 2000): Promise<number> {
  let count = 0;
  const off = pad.onState(() => count++);
  await sleep(ms);
  off();
  return Math.round((count * 1000) / ms);
}

const idleDongle = (await HID.devicesAsync()).some((d) => d.vendorId === VENDOR_ID && d.productId === DONGLE_IDLE_PID);
if (idleDongle) console.log("dongle plugado sem controle conectado a ele (PID 0x0575)");

const found = await findControllers();
if (found.length === 0) {
  await listCandidates();
  process.exit(1);
}
for (const d of found)
  console.log(`encontrado: PID ${hex4(d.productId)} (${MODES[d.productId] ?? "?"}) ${d.product ?? ""}`);
if (found.length > 1) console.log("mais de um conectado: usando o primeiro");

const [{ path }] = found;
if (!path) throw new Error("coleção sem path");
const pad = new Cyclone2(await NodeHidTransport.open(path));
await pad.start();

const fw = await pad.readFirmwareVersion();
console.log(
  `firmware: controle ${fw.firmware || "(vazio)"}, dongle ${fw.dongle || "(vazio)"} | cru: ${hex(fw.raw, 18)}`,
);
console.log(`perfil ativo: ${await pad.readCurrentProfile()}`);

console.log(`reports 0x12/s: ${await statesPerSecond(pad)}`);
const s = pad.lastState as Cyclone2State;
console.log(
  `bateria ${s.batteryLevel}%, carregando ${s.chargeState}, animação ${s.lightConfigIndex}, Home ${rgb(s.leds.Home)}`,
);

for (const [name, num] of Object.entries(Profile)) {
  if (num === Profile.Current) continue;
  const bytes = await pad.readProfile(num);
  console.log(`perfil ${name}: ${bytes.length} B lidos`);
}

console.log("vibração: 300 ms");
await pad.vibrate(160, 160, 300);

const light = await pad.readLightProfile();
await pad.setStaticColor({ Home: "#ff0000" });
await sleep(1500);
console.log(`Home vermelho → report mostra ${rgb((pad.lastState as Cyclone2State).leds.Home)}`);
await pad.writeLightProfile(light);
await sleep(1500);
console.log(`luz restaurada → report mostra ${rgb((pad.lastState as Cyclone2State).leds.Home)}`);

await pad.close();
