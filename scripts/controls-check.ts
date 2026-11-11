// ============================================
// Touch controls — run with: npm test
// ============================================
// Drives src/game/touch.ts with synthetic touches, against a recording fake
// and then against a real RunEngine, in the same loud-failure style as
// sim-check.ts.

import { RunEngine } from "../src/game/engine";
import { DOWNHILL, HEADING_DEG, STEP_S, TRICK_BACKFLIP, TRICK_SPIN_R } from "../src/game/sim";
import { HOLD_S, TouchSteering, TUCK_DRAG_PX, type GameInput } from "../src/game/touch";

let fails = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`${cond ? "  ok" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

const ORIGIN = { x: 200, y: 250 }; // where the skier is on screen
const RIGHTMOST = HEADING_DEG.length - 1;

/** Records every call; `inAir` decides whether tricks are accepted. */
function fake(inAir = false) {
  const log = {
    aims: [] as { idx: number | null; sidestep: boolean }[],
    tucks: [] as boolean[],
    actions: 0,
    tricks: [] as number[],
  };
  const input: GameInput = {
    aim: (idx, sidestep = false) => void log.aims.push({ idx, sidestep }),
    tuck: (on) => void log.tucks.push(on),
    action: () => void log.actions++,
    trick: (kind) => (inAir ? (log.tricks.push(kind), true) : false),
  };
  return { log, touch: new TouchSteering(input, () => ORIGIN) };
}
const lastAim = (log: ReturnType<typeof fake>["log"]) =>
  [...log.aims].reverse().find((a) => a.idx !== null);

console.log("tap vs hold");
{
  const { log, touch } = fake();
  touch.down(260, 400, 0);
  touch.tick(0.05);
  touch.up(true);
  ok("a quick tap hops", log.actions === 1);
  ok("…and never steers", lastAim(log) === undefined);
}
{
  const { log, touch } = fake();
  touch.down(260, 400, 0);
  touch.tick(HOLD_S + 0.01);
  touch.up(true);
  ok("a held press steers instead of hopping", log.actions === 0 && lastAim(log) !== undefined);
  ok("letting go releases the aim and the tuck", log.aims.at(-1)?.idx === null && log.tucks.at(-1) === false);
}
{
  const { log, touch } = fake();
  touch.down(260, 400, 0);
  touch.up(false);
  ok("a cancelled touch doesn't hop", log.actions === 0);
}

console.log("steering");
{
  const { log, touch } = fake();
  touch.down(ORIGIN.x, ORIGIN.y + 60, 0);
  touch.move(ORIGIN.x + 60, ORIGIN.y + 60); // drag → aiming at once, 45° right
  const a = lastAim(log);
  ok("down-right aims right of the fall line", a !== undefined && a.idx! > DOWNHILL && a.idx! < RIGHTMOST, `idx ${a?.idx}`);
  touch.move(ORIGIN.x - 60, ORIGIN.y + 60);
  ok("dragging across swings the aim left", lastAim(log)!.idx! < DOWNHILL);
}
{
  const { log, touch } = fake();
  touch.down(ORIGIN.x, ORIGIN.y + 40, 0);
  touch.move(ORIGIN.x, ORIGIN.y + 60);
  ok("straight down, near: downhill, no tuck", lastAim(log)!.idx === DOWNHILL && log.tucks.at(-1) === false);
  touch.move(ORIGIN.x + 5, ORIGIN.y + TUCK_DRAG_PX + 40);
  ok("straight down, far: tuck", log.tucks.at(-1) === true);
}
{
  const { log, touch } = fake();
  touch.down(ORIGIN.x - 100, ORIGIN.y - 30, 0);
  touch.tick(HOLD_S);
  const a = lastAim(log)!;
  ok("level/above and well left: stop side-on and sidestep", a.idx === 0 && a.sidestep);
  touch.move(ORIGIN.x + 20, ORIGIN.y);
  const b = lastAim(log)!;
  ok("level and just right: side-on, no sidestep", b.idx === RIGHTMOST && !b.sidestep);
}

console.log("tricks");
{
  const { log, touch } = fake(true);
  touch.down(100, 400, 0);
  touch.move(160, 405);
  ok("a swipe right in the air spins right", log.tricks.length === 1 && log.tricks[0] === TRICK_SPIN_R);
  touch.move(160, 500);
  ok("one trick per touch", log.tricks.length === 1);
  touch.up(true);
  ok("a trick swipe doesn't also hop", log.actions === 0);

  touch.down(100, 300, 1);
  touch.move(102, 350);
  ok("a swipe down is a backflip", log.tricks.at(-1) === TRICK_BACKFLIP);
}
{
  const { log, touch } = fake(false);
  touch.down(ORIGIN.x, ORIGIN.y + 60, 0);
  touch.move(ORIGIN.x + 60, ORIGIN.y + 60);
  ok("on the snow the same swipe steers", log.tricks.length === 0 && lastAim(log) !== undefined);
}

console.log("against a real run");
{
  const e = new RunEngine(4242);
  const touch = new TouchSteering(e, () => ORIGIN);
  let t = 0;
  const run = (secs: number) => {
    for (let k = 0; k < Math.round(secs / STEP_S); k++) {
      t += STEP_S;
      touch.tick(t);
      e.advance(STEP_S);
    }
  };
  run(1);
  ok("untouched, the skier waits at the top", e.sim.y === 0 && e.sim.speed === 0);
  touch.down(ORIGIN.x + 120, ORIGIN.y + 200, t); // ~31° right of the fall line
  run(2);
  touch.up(true);
  ok("holding a finger down-right skis down and right", e.sim.y > 50 && e.sim.x > 5, `x ${e.sim.x.toFixed(0)} y ${e.sim.y.toFixed(0)}`);

  const h = new RunEngine(1);
  const hop = new TouchSteering(h, () => ORIGIN);
  hop.down(10, 10, 0);
  hop.up(true);
  h.advance(STEP_S);
  ok("a tap at the top hops", h.sim.z > 0 || h.sim.vz > 0);
}

console.log(fails === 0 ? "\nall controls checks passed" : `\n${fails} check(s) FAILED`);
process.exit(fails === 0 ? 0 : 1);
