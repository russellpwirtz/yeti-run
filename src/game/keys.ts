// Keyboard controls: turns key presses into game input.
//
//   ← → / A D    turn one heading per press; held, the sim repeats the turn
//   ↓ / S        point downhill; held, tuck
//   Space / ↑ W  hop (a Daffy in ramp air)
//   In ramp air the arrows (and WASD) are tricks instead: ← → spins,
//   ↑ Daffy, ↓ backflip.
//
// Plain logic with no DOM: keyboard-listener.web.ts feeds it `KeyboardEvent.key`
// strings, and scripts/controls-check.ts feeds it the same strings directly.

import { TRICK_BACKFLIP, TRICK_DAFFY, TRICK_SPIN_L, TRICK_SPIN_R } from './sim';
import type { GameInput } from './touch';

/** Touch's input plus a held left/right — RunEngine implements it. */
export type KeyInput = GameInput & { steer(dir: -1 | 0 | 1): void };

type Role = 'left' | 'right' | 'down' | 'hop';

const ROLES: Record<string, Role> = {
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  ArrowDown: 'down',
  s: 'down',
  ArrowUp: 'hop',
  w: 'hop',
  ' ': 'hop',
};

// Space is the hop only — it's never a trick, so it stays a Daffy in the air.
const TRICK_KEYS: Record<string, number> = {
  ArrowLeft: TRICK_SPIN_L,
  a: TRICK_SPIN_L,
  ArrowRight: TRICK_SPIN_R,
  d: TRICK_SPIN_R,
  ArrowUp: TRICK_DAFFY,
  w: TRICK_DAFFY,
  ArrowDown: TRICK_BACKFLIP,
  s: TRICK_BACKFLIP,
};

/** Letters arrive as 'A' with Shift or Caps Lock on; the arrows and space don't change. */
const norm = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

export class KeyboardSteering {
  private left = false;
  private right = false;
  private tucking = false;

  constructor(private readonly input: KeyInput) {}

  /**
   * A key went down. `repeat` is the OS auto-repeat, which is ignored: held
   * turns repeat inside the sim on their own clock. Returns true if the key is
   * a game key, so the caller can stop the browser scrolling on it.
   */
  down(rawKey: string, repeat = false): boolean {
    const key = norm(rawKey);
    const role = ROLES[key];
    if (!role) return false;
    if (repeat) return true;

    const trick = TRICK_KEYS[key];
    if (trick !== undefined && this.input.trick(trick)) return true;

    switch (role) {
      case 'left':
        this.left = true;
        this.syncSteer();
        break;
      case 'right':
        this.right = true;
        this.syncSteer();
        break;
      case 'down':
        this.tucking = true;
        this.input.tuck(true);
        break;
      case 'hop':
        this.input.action();
        break;
    }
    return true;
  }

  up(rawKey: string): boolean {
    const role = ROLES[norm(rawKey)];
    if (role === 'left') this.left = false;
    else if (role === 'right') this.right = false;
    else if (role === 'down') this.releaseTuck();
    if (role === 'left' || role === 'right') this.syncSteer();
    return role !== undefined;
  }

  /** Let go of everything — the window lost focus, so no keyup will come. */
  releaseAll(): void {
    const wasSteering = this.left || this.right;
    this.left = this.right = false;
    if (wasSteering) this.input.steer(0);
    this.releaseTuck();
  }

  private releaseTuck() {
    if (!this.tucking) return;
    this.tucking = false;
    this.input.tuck(false);
  }

  // Both held cancel out, like the web version.
  private syncSteer() {
    this.input.steer(this.left === this.right ? 0 : this.left ? -1 : 1);
  }
}
