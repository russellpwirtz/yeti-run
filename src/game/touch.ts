// Touch controls: turns one finger's down / move / up into game input.
// Ported from rungotchu's pointer steering (yeti-run-game.tsx).
//
//   Steer  — touch and hold where you want to go, and drag to adjust. The skis
//            swing toward the finger. Level with or above the skier means stop
//            side-on (and shuffle sideways if the finger is well out to that
//            side).
//   Hop    — a quick tap. Steering only engages after HOLD_S or a DRAG_PX
//            move, so a tap never yanks the skis sideways first.
//   Tuck   — drag far below the skier, straight down the fall line.
//   Tricks — in ramp air, a swipe: ← / → spin, ↑ Daffy, ↓ backflip. One per
//            touch.
//
// No timers and no platform APIs: time comes in through `tick(now)` from the
// game loop, so the rules check can drive it frame by frame.

import { DOWNHILL, HEADING_DEG, TRICK_BACKFLIP, TRICK_DAFFY, TRICK_SPIN_L, TRICK_SPIN_R } from './sim';

/** What the controls drive — RunEngine implements it. */
export type GameInput = {
  aim(idx: number | null, sidestep?: boolean): void;
  tuck(on: boolean): void;
  action(): void;
  trick(kind: number): boolean;
};

export const HOLD_S = 0.11; // a press held this long steers instead of hopping
export const DRAG_PX = 10; // …or moved this far
export const SWIPE_PX = 28; // travel in ramp air that counts as a trick swipe
export const TUCK_DRAG_PX = 120; // how far below the skier a straight-down drag tucks
const LEVEL_PX = 14; // finger less than this below the skier counts as level
const SIDESTEP_PX = 36; // …and this far out to the side shuffles sideways

type Press = {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startT: number;
  aiming: boolean;
  tricked: boolean;
};

export class TouchSteering {
  private press: Press | null = null;

  /**
   * `origin` is where the skier is on screen, in the same coordinates as the
   * touches — read on every use, so a resized field just works.
   */
  constructor(
    private readonly input: GameInput,
    private readonly origin: () => { x: number; y: number },
  ) {}

  down(x: number, y: number, now: number): void {
    this.press = { x, y, startX: x, startY: y, startT: now, aiming: false, tricked: false };
  }

  move(x: number, y: number): void {
    const p = this.press;
    if (!p) return;
    if (!p.aiming && Math.hypot(x - p.x, y - p.y) > DRAG_PX) p.aiming = true;
    p.x = x;
    p.y = y;
    this.swipeTrick(p);
    if (p.aiming && !p.tricked) this.aimAt(p.x, p.y);
  }

  /** Called every frame: a press held long enough starts steering. */
  tick(now: number): void {
    const p = this.press;
    if (p && !p.aiming && now - p.startT >= HOLD_S) {
      p.aiming = true;
      this.aimAt(p.x, p.y);
    }
  }

  /** Finger lifted (`completed`) or the touch was cancelled by the system. */
  up(completed: boolean): void {
    const p = this.press;
    if (!p) return;
    if (completed && !p.aiming && !p.tricked) this.input.action();
    this.input.aim(null);
    this.input.tuck(false);
    this.press = null;
  }

  private swipeTrick(p: Press) {
    const dx = p.x - p.startX;
    const dy = p.y - p.startY;
    if (p.tricked || Math.hypot(dx, dy) < SWIPE_PX) return;
    const kind =
      Math.abs(dx) > Math.abs(dy)
        ? dx < 0
          ? TRICK_SPIN_L
          : TRICK_SPIN_R
        : dy < 0
          ? TRICK_DAFFY
          : TRICK_BACKFLIP;
    if (this.input.trick(kind)) p.tricked = true;
  }

  private aimAt(x: number, y: number) {
    const o = this.origin();
    const dx = x - o.x;
    const dy = y - o.y;
    if (dy < LEVEL_PX) {
      this.input.aim(dx < 0 ? 0 : HEADING_DEG.length - 1, Math.abs(dx) > SIDESTEP_PX);
      this.input.tuck(false);
      return;
    }
    const deg = (Math.atan2(dx, dy) * 180) / Math.PI; // 0 = straight down the fall line
    this.input.aim(Math.round(deg / 30) + DOWNHILL);
    this.input.tuck(Math.abs(deg) < 15 && dy > TUCK_DRAG_PX);
  }
}
