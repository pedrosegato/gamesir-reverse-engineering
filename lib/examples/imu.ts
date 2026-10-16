import type { Vec3 } from "../src/index.js";
import { openFirstCyclone2 } from "./_open.js";

const INTERVAL_MS = 100;
const LSB_PER_G = 8192;

const pad = await openFirstCyclone2();

const fmt = (v: readonly (number | string)[], width = 7) => v.map((n) => String(n).padStart(width)).join("");
const xyz = ({ x, y, z }: Vec3) => [x, y, z];
const inG = (v: Vec3) => fmt(xyz(v).map((n) => (n / LSB_PER_G).toFixed(2)));

console.log("gire e incline um eixo por vez; Ctrl+C sai");
console.log(`${"cnt".padStart(4)} | ${"gyro x y z".padStart(21)} | ${"accel x y z".padStart(21)} | accel (g)`);

let lastPrint = 0;
pad.onState(({ imu }) => {
  const now = Date.now();
  if (now - lastPrint < INTERVAL_MS) return;
  lastPrint = now;
  console.log(
    `${String(imu.counter).padStart(4)} | ${fmt(xyz(imu.gyro))} | ${fmt(xyz(imu.accel))} | ${inG(imu.accel)}`,
  );
});

process.on("SIGINT", async () => {
  await pad.close();
  process.exit(0);
});
