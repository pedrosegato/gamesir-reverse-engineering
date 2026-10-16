import { setTimeout as sleep } from "node:timers/promises";
import { type Animation, animation, Cyclone2, type FrameInput } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import { indicatorsFor } from "./indicators.js";
import type { IndicatorKey } from "./status.js";

/**
 * The controller plays at most 8 equally long frames, too few for quick blinks followed by a long pause, so the
 * app steps through the frames with `showFrame` and holds the last, all-off frame for `pauseMs`.
 */
interface Burst {
  readonly stepMs: number;
  readonly pauseMs: number;
}

interface Proposal {
  readonly animation: Animation;
  readonly burst?: Burst;
}

const SLOT = 3;

const solid = (color: string): Proposal => ({ animation: animation([{ Home: color }]) });

/** Home blinks while the sides go left, right, off, right, left. */
function alert(color: string): Proposal {
  const frames: FrameInput[] = [
    { Home: color, LowerLeft: color },
    { LowerRight: color },
    { Home: color },
    { LowerRight: color },
    { Home: color, LowerLeft: color },
    {},
  ];
  return { animation: animation(frames), burst: { stepMs: 250, pauseMs: 12_000 } };
}

export const PROPOSALS: Readonly<Record<IndicatorKey, Proposal>> = {
  critical: alert("#ff0000"),
  low: solid("#ff0000"),
  medium: solid("#ffcc00"),
  good: solid("#66ff33"),
  high: solid("#00a000"),
  charged: alert("#ffffff"),
  charging: { animation: indicatorsFor("Home").charging.animation },
};

export const isProposal = (key: string): key is IndicatorKey => Object.hasOwn(PROPOSALS, key);

const pause = (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => undefined);

const aborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

async function playBursts(pad: Cyclone2, frameCount: number, { stepMs, pauseMs }: Burst, signal: AbortSignal) {
  while (!signal.aborted) {
    for (let frame = 0; frame < frameCount && !signal.aborted; frame++) {
      await pad.showFrame(frame);
      await pause(frame === frameCount - 1 ? pauseMs : stepMs, signal);
    }
  }
}

/** Shows the proposal on animation slot 4 until `signal` fires, then puts the original light back. */
export async function runPreview(key: IndicatorKey, signal: AbortSignal): Promise<void> {
  const [found] = await findControllers();
  if (!found) throw new Error("no controller found");
  const pad = new Cyclone2(await NodeHidTransport.open(found.path));
  const light = await pad.readLightProfile();
  const saved = { activeAnimation: light.activeAnimation, animation: light.animations[SLOT] };
  const proposal = PROPOSALS[key];
  try {
    await pad.setAnimation(proposal.animation, { slot: SLOT });
    if (proposal.burst) await playBursts(pad, proposal.animation.keyFrameCount, proposal.burst, signal);
    else await aborted(signal);
  } finally {
    await pad.playLights();
    await pad.updateLightProfile((p) => ({
      ...p,
      activeAnimation: saved.activeAnimation,
      animations: p.animations.map((a, i) => (i === SLOT ? saved.animation : a)),
    }));
    await pad.close();
  }
}
