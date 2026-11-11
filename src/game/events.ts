// Game events: the moments worth a sound, a buzz, or a pop-up. The sim keeps
// no event list of its own — it just has state — so EventWatcher compares the
// state before and after each step and reports what changed.

import type { YetiRunSim } from './sim';

export type GameEvent =
  | { type: 'hop' } // off the snow: a hop or a mogul
  | { type: 'ramp' } // off a ramp — big air, tricks on
  | { type: 'style'; label: string; pts: number } // gate, air, trick, clean landing
  | { type: 'crash'; kind: 'tree' | 'wipeout' }
  | { type: 'howl' } // the yeti has woken
  | { type: 'chase' } // …and it's coming
  | { type: 'caught' };

export class EventWatcher {
  private airborne = false;
  private popSeq = 0;
  private crashSeq = 0;
  private yeti: YetiRunSim['yeti'] = 'asleep';

  constructor(s: YetiRunSim) {
    this.sync(s);
  }

  /** Call after each sim step; appends this step's events to `out`. */
  collect(s: YetiRunSim, out: GameEvent[]): void {
    const airborne = s.z > 0;
    if (airborne && !this.airborne) out.push({ type: s.bigAir ? 'ramp' : 'hop' });
    if (s.crashSeq !== this.crashSeq && s.crashKind) out.push({ type: 'crash', kind: s.crashKind });
    if (s.pop && s.pop.seq !== this.popSeq) {
      out.push({ type: 'style', label: s.pop.label, pts: s.pop.pts });
    }
    if (s.yeti !== this.yeti && s.yeti !== 'asleep') out.push({ type: s.yeti });
    this.sync(s);
  }

  private sync(s: YetiRunSim) {
    this.airborne = s.z > 0;
    this.popSeq = s.popSeq;
    this.crashSeq = s.crashSeq;
    this.yeti = s.yeti;
  }
}
