import type { Cyclone2State } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const pad = await openFirstCyclone2();

const rgb = ({ r, g, b }: { r: number; g: number; b: number }) => `${r},${g},${b}`;
const axis = (v: number) => v.toFixed(2).padStart(5);

function describe(s: Cyclone2State): string {
  const pressed = Object.entries(s.buttons)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(" ");
  return [
    `bat ${s.batteryLevel}%${s.chargeState ? "⚡" : ""}`,
    `LS ${axis(s.leftStick.x)},${axis(s.leftStick.y)}`,
    `RS ${axis(s.rightStick.x)},${axis(s.rightStick.y)}`,
    `LT ${String(s.leftTrigger).padStart(3)} RT ${String(s.rightTrigger).padStart(3)}`,
    `hat ${s.hat ?? "-"}`,
    `[${pressed}]`,
    `anim ${s.lightConfigIndex}`,
    `Home ${rgb(s.leds.Home)} LL ${rgb(s.leds.LowerLeft)} LR ${rgb(s.leds.LowerRight)} UR ${rgb(s.leds.UpperRight)}`,
  ].join(" | ");
}

let last = "";
pad.onState((s) => {
  const line = describe(s);
  if (line === last) return;
  last = line;
  console.log(line.slice(0, (process.stdout.columns || 200) - 1));
});

process.on("SIGINT", async () => {
  await pad.close();
  process.exit(0);
});
