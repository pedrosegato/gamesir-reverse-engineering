import type { Steps } from "./indicators.js";

/** `isCurrent` lets a queued write drop itself when the stepper was stopped before the write ran. */
export type ShowFrame = (frame: number, isCurrent: () => boolean) => Promise<void>;

/** Plays `Steps` on its own timer; `stop` also clears the pending timer. */
export class Stepper {
  private run = 0;
  private cancelWait: (() => void) | undefined;

  constructor(private readonly showFrame: ShowFrame) {}

  /** Resolves when stopped, rejects when a frame fails to show. */
  async play({ frames, stepMs, holdMs }: Steps): Promise<void> {
    this.stop();
    const run = this.run;
    const isCurrent = () => this.run === run;
    while (isCurrent()) {
      for (const [i, frame] of frames.entries()) {
        await this.showFrame(frame, isCurrent);
        if (!isCurrent()) return;
        await this.wait(i === frames.length - 1 ? holdMs : stepMs);
        if (!isCurrent()) return;
      }
    }
  }

  stop(): void {
    this.run++;
    this.cancelWait?.();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.cancelWait = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      this.cancelWait = done;
    });
  }
}
