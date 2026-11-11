// Score pop-ups: "GATE +25", "BACKFLIP +30", "WIPEOUT!" floating up over the
// skier. Ported from rungotchu's pops (motion.div + AnimatePresence there);
// here it's a plain list the renderer reads each frame. Time comes in from the
// game loop, so the checks can drive it.

import type { GameEvent } from './events';

export const POP_LIFE_S = 1.1;
const MAX_POPS = 3; // the newest few; older ones are dropped

export type PopTone = 'gate' | 'style' | 'bad';
export type Pop = { text: string; tone: PopTone; born: number };

/** A pop as drawn: how far through its life (0→1) and its slot (0 = newest). */
export type LivePop = Pop & { age: number; slot: number };

export class PopFeed {
  private pops: Pop[] = [];

  /** Turn this frame's game events into pops. */
  push(events: readonly GameEvent[], now: number): void {
    for (const e of events) {
      if (e.type === 'style') {
        const tone = e.label.startsWith('Gate') ? 'gate' : 'style';
        this.add({ text: `${e.label} +${e.pts}`.toUpperCase(), tone, born: now });
      } else if (e.type === 'crash' && e.kind === 'wipeout') {
        this.add({ text: 'WIPEOUT!', tone: 'bad', born: now });
      }
    }
  }

  live(now: number): LivePop[] {
    this.pops = this.pops.filter((p) => now - p.born < POP_LIFE_S);
    const n = this.pops.length;
    return this.pops.map((p, i) => ({ ...p, age: (now - p.born) / POP_LIFE_S, slot: n - 1 - i }));
  }

  private add(p: Pop) {
    this.pops.push(p);
    if (this.pops.length > MAX_POPS) this.pops.shift();
  }
}
