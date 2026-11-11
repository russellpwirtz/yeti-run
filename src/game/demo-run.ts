// A run played by the steering bot that you can scrub to any moment. Stepping
// forward continues from where it is; scrubbing backward replays from the
// seed — which is cheap, and exact, because the sim is deterministic.
//
// Milestone 3 scaffolding: it lets the renderer be checked frame by frame
// before there's a game loop (milestone 4) or touch controls (milestone 5).

import { makeSteerBot } from './bots';
import { freshSim, snapshotOf, step, STEP_S, type YetiRunSim, type YetiRunSnapshot } from './sim';

const autopilot = makeSteerBot(false);

export class DemoRun {
  private sim: YetiRunSim;
  private frame = 0;

  constructor(readonly seed: number) {
    this.sim = freshSim(seed);
  }

  /** Seconds the run lasted, once it has been played to the end; else null. */
  get endedAt(): number | null {
    return this.sim.over ? this.frame * STEP_S : null;
  }

  /** Snapshot at `seconds` into the run (clamped to when the yeti caught you). */
  at(seconds: number, view: Parameters<typeof snapshotOf>[1]): YetiRunSnapshot {
    const target = Math.round(seconds / STEP_S);
    if (target < this.frame) {
      this.sim = freshSim(this.seed);
      this.frame = 0;
    }
    while (this.frame < target && !this.sim.over) {
      autopilot(this.sim, this.frame);
      step(this.sim);
      this.frame++;
    }
    return snapshotOf(this.sim, view);
  }
}
