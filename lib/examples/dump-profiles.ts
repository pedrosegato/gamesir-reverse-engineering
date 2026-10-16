import { writeFile } from "node:fs/promises";
import { Profile } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const pad = await openFirstCyclone2();
const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

const firmware = await pad.readFirmwareVersionRaw();
const current = await pad.readCurrentProfile();
const dump: Record<string, string | number> = { firmware: hex(firmware), currentProfile: current };
for (const [name, num] of Object.entries(Profile)) {
  if (num === Profile.Current) continue;
  dump[name] = hex(await pad.readProfile(num));
  console.log(`perfil ${name} (${num}) lido`);
}

const file = `cyclone2-dump-${Date.now()}.json`;
await writeFile(file, JSON.stringify(dump, null, 2));
console.log(`salvo em ${file}`);
await pad.close();
