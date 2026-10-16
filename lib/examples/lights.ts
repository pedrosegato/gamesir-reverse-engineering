import { PRESETS, type PresetName } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const [command = "static", arg = "#00aaff"] = process.argv.slice(2);
const pad = await openFirstCyclone2();

switch (command) {
  case "static":
    await pad.setStaticColor(arg);
    break;
  case "home":
    await pad.setStaticColor({ Home: arg });
    break;
  case "preset":
    if (!(arg in PRESETS)) throw new Error(`presets: ${Object.keys(PRESETS).join(", ")}`);
    await pad.applyPreset(arg as PresetName);
    break;
  case "slot":
    await pad.setActiveAnimation(Number(arg));
    break;
  case "show": {
    const light = await pad.readLightProfile();
    console.dir(light, { depth: 4 });
    break;
  }
  default:
    console.log("uso: lights.ts static <#cor> | home <#cor> | preset <Nome> | slot <0..3> | show");
}

await pad.close();
