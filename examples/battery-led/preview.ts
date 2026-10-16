import { setTimeout as sleep } from "node:timers/promises";
import { type Animation, animation, Cyclone2, type FrameInput } from "gamesir-hid";
import { findControllers, NodeHidTransport } from "gamesir-hid/node";
import { indicatorsFor } from "./indicators.js";
import type { IndicatorKey } from "./status.js";

/**
 * The controller plays its frames in a loop, all equally long, so blinks followed by a long pause are stepped by
 * the app with `showFrame`: each frame index in `frames` for `stepMs`, the last one held for `holdMs`.
 */
interface Steps {
  readonly frames: readonly number[];
  readonly stepMs: number;
  readonly holdMs: number;
}

interface Proposal {
  readonly animation: Animation;
  readonly steps?: Steps;
}

const SLOT = 3;

const solid = (color: string): Proposal => ({ animation: animation([{ Home: color }]) });

/** Turn-signal style: "click" lights Home and the left side, "clack" the right side; then Home stays lit. */
function alert(color: string): Proposal {
  const click: FrameInput = { Home: color, LowerLeft: color };
  const clack: FrameInput = { LowerRight: color };
  const rest: FrameInput = { Home: color };
  return {
    animation: animation([click, clack, rest]),
    steps: { frames: [0, 1, 0, 1, 0, 1, 2], stepMs: 500, holdMs: 12_000 },
  };
}

export const PROPOSALS: Readonly<Record<IndicatorKey, Proposal>> = {
  critical: alert("#ff0000"),
  low: solid("#ff0000"),
  medium: solid("#ffcc00"),
  good: solid("#a0ff00"),
  high: solid("#00a000"),
  charged: alert("#ffffff"),
  charging: { animation: indicatorsFor("Home").charging.animation },
};

export const isProposal = (key: string): key is IndicatorKey => Object.hasOwn(PROPOSALS, key);

const pause = (ms: number, signal: AbortSignal) => sleep(ms, undefined, { signal }).catch(() => undefined);

const aborted = (signal: AbortSignal) =>
  new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));

async function playSteps(pad: Cyclone2, { frames, stepMs, holdMs }: Steps, signal: AbortSignal) {
  while (!signal.aborted) {
    for (const [i, frame] of frames.entries()) {
      if (signal.aborted) return;
      await pad.showFrame(frame);
      await pause(i === frames.length - 1 ? holdMs : stepMs, signal);
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
    if (proposal.steps) await playSteps(pad, proposal.steps, signal);
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
