import HID from "node-hid";
import {
  CONFIG_USAGE_PAGE,
  CYCLONE2_PIDS,
  DONGLE_IDLE_PID,
  protocol as P,
  Profile,
  STATE_REPORT_ID,
  VENDOR_ID,
} from "../src/index.js";

const hex = (b: ArrayLike<number>, n = 24) =>
  Array.from(b)
    .slice(0, n)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join(" ");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex4 = (n?: number) => `0x${(n ?? 0).toString(16).padStart(4, "0")}`;

const devices = (await HID.devicesAsync()).filter((d) => d.vendorId === VENDOR_ID);
console.log("coleções GameSir (VID 0x3537):");
for (const [i, d] of devices.entries()) {
  const known = CYCLONE2_PIDS.includes(d.productId)
    ? ""
    : d.productId === DONGLE_IDLE_PID
      ? " (dongle sem controle)"
      : " (PID fora da tabela do app)";
  console.log(
    `  [${i}] PID ${hex4(d.productId)}${known} interface ${d.interface} usagePage ${hex4(d.usagePage)} usage ${hex4(d.usage)}`,
  );
}

const opened: { label: string; dev: HID.HIDAsync; config: boolean }[] = [];
for (const [i, d] of devices.entries()) {
  if (!d.path) continue;
  try {
    const dev = await HID.HIDAsync.open(d.path);
    const label = `[${i}] ${hex4(d.usagePage)}/${hex4(d.usage)}`;
    let stateShown = false;
    dev.on("data", (data: Buffer) => {
      if (data[0] === STATE_REPORT_ID) {
        if (!stateShown) console.log(`${label} ← estado (${data.length} B): ${hex(data, 64)}`);
        stateShown = true;
        return;
      }
      console.log(`${label} ← (${data.length} B) ${hex(data)}`);
    });
    dev.on("error", (e: Error) => console.log(`${label} erro: ${e.message}`));
    opened.push({ label, dev, config: d.usagePage === CONFIG_USAGE_PAGE });
    console.log(`aberta ${label}`);
  } catch (e) {
    console.log(`[${i}] não abriu: ${(e as Error).message}`);
  }
}

const probes: [string, Uint8Array][] = [
  ["heartbeat", P.heartbeat()],
  ["ReadFwVersion", P.readFwVersion()],
  ["ReadCurrentProfile", P.readCurrentProfile()],
  ["ReadProfile 32 bloco 0", P.readProfile(Profile.Light)[0]],
  ["ReadProfile 1 bloco 0", P.readProfile(Profile.P1)[0]],
];

for (const target of opened.filter((o) => o.config)) {
  console.log(`\n=== enviando para ${target.label} ===`);
  for (const [name, pkt] of probes) {
    try {
      const written = await target.dev.write(Buffer.from(pkt));
      console.log(`→ ${name} (${written} B): ${hex(pkt, 8)}`);
    } catch (e) {
      console.log(`→ ${name} falhou: ${(e as Error).message}`);
    }
    await sleep(600);
  }
}

await sleep(500);
for (const o of opened) await o.dev.close();
