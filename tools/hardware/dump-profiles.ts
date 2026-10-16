import { writeFile } from "node:fs/promises";
import { Profile } from "gamesir-hid";
import { openFirstCyclone2 } from "./_open.js";

const pad = await openFirstCyclone2();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const firmware = await pad.readFirmwareVersion();
const current = await pad.readCurrentProfile();
const dump: Record<string, string | number> = {
  firmware: firmware.firmware,
  dongle: firmware.dongle,
  firmwareRaw: hex(firmware.raw),
  currentProfile: current,
};
for (const [name, num] of Object.entries(Profile)) {
  if (num === Profile.Current) continue;
  dump[name] = hex(await pad.readProfile(num));
  console.log(`perfil ${name} (${num}) lido`);
}

const file = `cyclone2-dump-${Date.now()}.json`;
await writeFile(file, JSON.stringify(dump, null, 2));
console.log(`salvo em ${file}`);
await pad.close();
