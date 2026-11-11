// Scripted players. The rule checks (scripts/sim-check.ts) measure the game
// with these, and the app reuses the steering bot as a demo autopilot until
// touch controls exist. Bots only call the sim's public input mutators, so they
// play by exactly the rules a person does.

import {
  DOWNHILL,
  HEADING_DEG,
  HITBOX,
  pressAction,
  setAim,
  setTuck,
  type Obstacle,
  type YetiRunSim,
} from "./sim";

export type Bot = (s: YetiRunSim, frame: number) => void;

// A plain steering bot: every few frames, look down each heading for the
// nearest thing it would hit and take the clear heading closest to the fall
// line. Hops rocks and stumps dead ahead. No tricks, no gate hunting — a
// competent but unambitious player.
function blockedWithin(s: YetiRunSim, near: Obstacle[], idx: number, horizon: number): number {
  const rad = (HEADING_DEG[idx] * Math.PI) / 180;
  const sx = Math.sin(rad);
  const sy = Math.cos(rad);
  for (let d = 8; d <= horizon; d += 8) {
    const px = s.x + sx * d;
    const py = s.y + sy * d;
    for (const o of near) {
      const hb = HITBOX[o.kind as Exclude<Obstacle["kind"], "gate">];
      if (Math.abs(px - o.x) < hb.hw + 13 && Math.abs(py - o.y) < hb.hh + 9) return d;
    }
  }
  return Infinity;
}
export function makeSteerBot(tuck: boolean): Bot {
  return (s, k) => {
    if (k % 3 !== 0) return;
    const horizon = 150;
    const near = s.obstacles.filter(
      (o) =>
        !o.hit &&
        o.kind !== "gate" &&
        o.kind !== "mogul" &&
        o.kind !== "ramp" &&
        o.y > s.y - 20 &&
        o.y < s.y + horizon + 20 &&
        Math.abs(o.x - s.x) < horizon + 30,
    );
    let best = DOWNHILL;
    let bestKey = -Infinity;
    for (const idx of [1, 2, 3, 4, 5]) {
      const b = blockedWithin(s, near, idx, horizon);
      const key = (b === Infinity ? 1000 : b) - Math.abs(idx - DOWNHILL) * 12;
      if (key > bestKey) {
        bestKey = key;
        best = idx;
      }
    }
    setAim(s, best);
    if (tuck) {
      // Tuck only when the fall line is clear well ahead (it can't turn).
      const far = s.obstacles.filter(
        (o) =>
          !o.hit &&
          o.kind !== "gate" &&
          o.kind !== "mogul" &&
          o.kind !== "ramp" &&
          o.y > s.y - 20 &&
          o.y < s.y + 340 &&
          Math.abs(o.x - s.x) < 60,
      );
      setTuck(s, best === DOWNHILL && blockedWithin(s, far, DOWNHILL, 320) === Infinity);
    }
    if (s.crashT <= 0 && s.z <= 0) {
      for (const o of s.obstacles) {
        if ((o.kind !== "rock" && o.kind !== "stump") || o.hit) continue;
        const dy = o.y - s.y;
        if (dy > 0 && dy < 26 && Math.abs(o.x - s.x) < 20) {
          pressAction(s);
          break;
        }
      }
    }
  };
}
