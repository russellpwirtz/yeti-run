// The run engine: owns one sim and turns real elapsed time into fixed sim
// steps, and keeps the ski-track history the renderer draws. No React and no
// platform APIs, so the rule checks and the PNG preview drive it too.
//
// Ported from the loop half of rungotchu's use-yeti-run.ts.

import type { Bot } from './bots';
import {
  freshSim,
  MAX_FRAME_S,
  snapshotOf,
  step,
  STEP_S,
  type YetiRunSim,
  type YetiRunSnapshot,
} from './sim';

/** One unbroken pair of ski tracks (a jump or a crash ends a segment). */
export type TrackPoint = { x: number; y: number; heading: number };
export type TrackSeg = TrackPoint[];

const TRACK_SPACING = 7; // px between recorded points
export const TRACK_MAX_POINTS = 260;

export class RunEngine {
  readonly sim: YetiRunSim;
  readonly tracks: TrackSeg[] = [];
  private trackOpen = false;
  private trackPoints = 0;
  private acc = 0;
  private frame = 0;

  /** `bot`, if given, plays the run (the autopilot) — called before each step. */
  constructor(seed: number, private readonly bot?: Bot) {
    this.sim = freshSim(seed);
  }

  get over(): boolean {
    return this.sim.over;
  }

  /** Seconds of sim time played so far. */
  get elapsed(): number {
    return this.frame * STEP_S;
  }

  /**
   * Advance by `seconds` of real time: as many fixed STEP_S steps as fit, with
   * the remainder carried to the next call. A long stall (a dropped frame, the
   * app coming back from the background) is capped at MAX_FRAME_S so the skier
   * never teleports. Returns false once the run has ended.
   */
  advance(seconds: number): boolean {
    this.acc += Math.min(Math.max(seconds, 0), MAX_FRAME_S);
    while (this.acc >= STEP_S && !this.sim.over) {
      this.bot?.(this.sim, this.frame);
      step(this.sim);
      this.frame++;
      this.acc -= STEP_S;
      this.recordTracks();
    }
    return !this.sim.over;
  }

  snapshot(view: Parameters<typeof snapshotOf>[1]): YetiRunSnapshot {
    return snapshotOf(this.sim, view);
  }

  private recordTracks() {
    const s = this.sim;
    if (!(s.z <= 0 && s.crashT <= 0 && s.speed > 20)) {
      this.trackOpen = false;
      return;
    }
    if (!this.trackOpen) {
      this.tracks.push([]);
      this.trackOpen = true;
    }
    const seg = this.tracks[this.tracks.length - 1];
    const last = seg[seg.length - 1];
    if (last && Math.hypot(s.x - last.x, s.y - last.y) < TRACK_SPACING) return;
    seg.push({ x: s.x, y: s.y, heading: s.heading });
    this.trackPoints++;
    // Oldest points fade out first
    while (this.trackPoints > TRACK_MAX_POINTS) {
      this.tracks[0].shift();
      this.trackPoints--;
      if (this.tracks[0].length === 0) this.tracks.shift();
    }
  }
}
