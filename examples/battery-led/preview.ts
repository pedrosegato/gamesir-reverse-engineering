import { Cyclone2 } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import { INDICATORS } from "./indicators.js";
import type { IndicatorKey } from "./status.js";
import { Stepper } from "./stepper.js";

export const isIndicatorKey = (key: string): key is IndicatorKey => Object.hasOwn(INDICATORS, key);

const aborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

/** Shows one indicator on animation `slot` until `signal` fires, then puts the original light back. */
export async function runPreview(key: IndicatorKey, slot: number, signal: AbortSignal): Promise<void> {
  const [found] = await findControllers();
  if (!found) throw new Error("no controller found");
  const pad = new Cyclone2(await NodeHidTransport.open(found.path));
  const light = await pad.readLightProfile();
  const saved = { activeAnimation: light.activeAnimation, animation: light.animations[slot] };
  const { animation, steps } = INDICATORS[key];
  const stepper = new Stepper((frame) => pad.showFrame(frame));
  const stop = () => stepper.stop();
  signal.addEventListener("abort", stop, { once: true });
  try {
    await pad.setAnimation(animation, { slot });
    if (signal.aborted) return;
    if (steps) await stepper.play(steps);
    else await aborted(signal);
  } finally {
    signal.removeEventListener("abort", stop);
    stepper.stop();
    await pad.playLights();
    await pad.updateLightProfile((p) => ({
      ...p,
      activeAnimation: saved.activeAnimation,
      animations: p.animations.map((a, i) => (i === slot ? saved.animation : a)),
    }));
    await pad.close();
  }
}
