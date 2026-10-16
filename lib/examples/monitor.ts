import { openFirstCyclone2 } from "./_open.js";

const pad = await openFirstCyclone2();
const pressed = (b: Record<string, boolean>) =>
  Object.entries(b)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(" ");

pad.onState((s) => {
  const leds = Object.entries(s.leds)
    .map(([zone, c]) => `${zone}=${c.r},${c.g},${c.b}`)
    .join(" ");
  process.stdout.write(
    `\rbat ${s.batteryLevel}% chg ${s.chargeState} | LS ${s.leftStick.x.toFixed(2)},${s.leftStick.y.toFixed(2)} ` +
      `LT ${s.leftTrigger} RT ${s.rightTrigger} hat ${s.hat ?? "-"} | ${pressed({ ...s.buttons })} | ${leds}    `,
  );
});

process.on("SIGINT", async () => {
  await pad.close();
  process.exit(0);
});
