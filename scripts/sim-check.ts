// ============================================
// Yeti Run sim rules — run with: npm test
// ============================================
// Plain asserts against the real sim (src/game/sim.ts), in the
// style of trail-dash-bird-check.ts: loud failures, exit 1 on any violation,
// no DB.
//
// What's asserted:
//   a. determinism — same seed + same inputs → the same run, and the hill is a
//      pure function of (seed, chunk) whatever order it's generated in
//   b. the start apron is clear and the skier stands still until steered
//   c. every run ends: the yeti always catches up, idle or not
//   d. the skill floor (SKILL_FLOOR, rungotchu's old reward floor) sits above
//      a run you never touch or only point downhill once, and below a plain
//      steering bot — and steering clearly beats mashing "downhill" through
//      every tree (the skill is the steering)
//   e. tuck: it's worth holding on a clear line (a steering bot that tucks
//      through open snow beats one that never does), and steering still
//      doubles holding it blind down the fall line
//   f. air rules: a hop clears a rock but not a pine; ramp air grows with hit
//      speed, so a tucked hit fits a combo a standing one can't; landing
//      mid-trick wipes out; the arrows don't steer in the air
//
// It also prints the score distributions per bot, because those are the
// numbers someone will want when re-tuning the floor or the yeti.

import {
  DOWNHILL,
  STEP_S,
  TRICKS,
  TRICK_BACKFLIP,
  TRICK_DAFFY,
  TRICK_SPIN_L,
  TRICK_SPIN_R,
  computeScore,
  freshSim,
  generateChunk,
  pointDownhill,
  pressAction,
  pressTrick,
  CHAIN_WINDOW_S,
  setAim,
  setSteer,
  setTuck,
  step,
  type YetiRunSim,
} from "../src/game/sim";
import { makeSteerBot, type Bot } from "../src/game/bots";

let fails = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`${cond ? "  ok" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

const MAX_STEPS = Math.round(240 / STEP_S); // 4 minutes — no run should get near
// A score no skill-less run should reach but any plain steering run clears.
// Was rungotchu's reward floor (minQualifyingScore); kept as a tuning guard.
const SKILL_FLOOR = 250;
const FLOOR = SKILL_FLOOR;

function run(seed: number, bot: Bot): { score: number; steps: number; s: YetiRunSim } {
  const s = freshSim(seed);
  let k = 0;
  for (; k < MAX_STEPS; k++) {
    bot(s, k);
    if (!step(s)) break;
  }
  return { score: computeScore(s), steps: k, s };
}

// Never touches anything.
const idleBot: Bot = () => {};
// Points downhill once at the start, then lets go.
const pointOnceBot: Bot = (s, k) => {
  if (k === 0) pointDownhill(s);
};
// Mashes "downhill" forever — no steering, just gets back up and goes again.
const downMashBot: Bot = (s) => {
  pointDownhill(s);
};

// Holds the tuck forever — the fall line at speed, eyes closed.
const tuckMashBot: Bot = (s) => {
  setTuck(s, true);
};
const steerBot = makeSteerBot(false);
const tuckSteerBot = makeSteerBot(true);

function pct(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}
function summary(label: string, rows: { score: number; steps: number }[]) {
  const scores = rows.map((r) => r.score);
  const secs = rows.map((r) => r.steps * STEP_S);
  console.log(
    `      ${label.padEnd(12)} score p10 ${pct(scores, 10)}  p50 ${pct(scores, 50)}  p90 ${pct(scores, 90)}  p99 ${pct(scores, 99)}` +
      `   run p50 ${pct(secs, 50).toFixed(0)}s  max ${Math.max(...secs).toFixed(0)}s`,
  );
}

// ── a. Determinism ───────────────────────────────────────────────────────────
console.log("determinism");
{
  const a = run(4242, steerBot);
  const b = run(4242, steerBot);
  ok("same seed + same bot → identical run", JSON.stringify(a.s) === JSON.stringify(b.s));
  const c1 = generateChunk(77, 3, 5);
  generateChunk(77, -2, 9); // unrelated work in between must not matter
  const c2 = generateChunk(77, 3, 5);
  ok("a chunk is a pure function of (seed, cx, cy)", JSON.stringify(c1) === JSON.stringify(c2));
  ok("different seeds → different hills", JSON.stringify(generateChunk(1, 0, 2)) !== JSON.stringify(generateChunk(2, 0, 2)));
}

// ── b. The start ─────────────────────────────────────────────────────────────
console.log("the start");
{
  let clear = true;
  for (let seed = 0; seed < 200; seed++) {
    const s = freshSim(seed);
    for (const o of s.obstacles) {
      if (o.y >= -60 && o.y < 300 && Math.abs(o.x) < 260) clear = false;
    }
  }
  ok("the start apron is clear on every seed", clear);
  const s = freshSim(9);
  for (let k = 0; k < 120; k++) step(s);
  ok("an untouched skier hasn't moved after 2s", s.y === 0 && s.speed === 0);
}

// ── c/d. Whole runs per bot ──────────────────────────────────────────────────
console.log(`runs (floor ${FLOOR})`);
{
  const SEEDS = 200;
  const bots: [string, Bot][] = [
    ["idle", idleBot],
    ["point-once", pointOnceBot],
    ["down-mash", downMashBot],
    ["tuck-mash", tuckMashBot],
    ["steer", steerBot],
    ["tuck-steer", tuckSteerBot],
  ];
  const results: Record<string, { score: number; steps: number }[]> = {};
  for (const [name, bot] of bots) {
    results[name] = [];
    for (let seed = 0; seed < SEEDS; seed++) results[name].push(run(1000 + seed, bot));
    summary(name, results[name]);
  }
  for (const [name] of bots) {
    ok(`${name}: every run ends (the yeti always catches up)`, results[name].every((r) => r.steps < MAX_STEPS));
  }
  ok("idle scores nothing", results.idle.every((r) => r.score === 0));
  const p = (name: string, q: number) => pct(results[name].map((r) => r.score), q);
  ok(`point-once p95 is below the floor`, p("point-once", 95) < FLOOR);
  ok(`steer bot p10 clears the floor`, p("steer", 10) >= FLOOR);
  ok(`steering doubles mashing downhill (median)`, p("steer", 50) >= 2 * p("down-mash", 50));
  // Same tools on both sides: tucking blind vs tucking with steering
  ok(`steering doubles holding the tuck blind (median)`, p("tuck-steer", 50) >= 2 * p("tuck-mash", 50));
  ok(`tucking on clear lines beats never tucking (median)`, p("tuck-steer", 50) > p("steer", 50));
}

// ── e. Tuck ──────────────────────────────────────────────────────────────────
console.log("tuck");
{
  // An empty hill far off to the side: tuck to full speed, try to turn, then
  // stand up on the fall line and settle.
  const s = freshSim(5);
  s.x = 10000;
  const settle = () => {
    for (let k = 0; k < 240; k++) {
      s.obstacles = [];
      step(s);
    }
  };
  setTuck(s, true);
  settle();
  const tucked = s.speed;
  setAim(s, DOWNHILL + 2);
  for (let k = 0; k < 30; k++) step(s);
  ok("a tuck pins the skis downhill", s.heading === DOWNHILL);
  setAim(s, null);
  setTuck(s, false);
  settle();
  ok("a tuck is faster than standing", tucked > s.speed * 1.2, `${tucked.toFixed(0)} vs ${s.speed.toFixed(0)} px/s`);
}

// ── f. Air rules ─────────────────────────────────────────────────────────────
console.log("air");
{
  // Hand-built hill: a lone rock (then a lone pine) dead ahead of a skier
  // already at full speed. Hop just before reaching it.
  function lane(kind: "rock" | "pine", hop: boolean): YetiRunSim {
    const s = freshSim(5);
    s.heading = DOWNHILL;
    s.speed = 300;
    s.x = 10000; // well out to the side of anything generated near the start
    s.y = 0;
    s.obstacles = [{ id: -1, kind, x: 10000, y: 120 }];
    s.chunks = {};
    s.genCx = Math.floor(s.x / 420);
    s.genCy = Math.floor(s.y / 420);
    let hopped = false;
    for (let k = 0; k < 60; k++) {
      if (hop && !hopped && s.y >= 120 - 40) {
        pressAction(s);
        hopped = true;
      }
      // keep only the lane obstacle in play
      s.obstacles = s.obstacles.filter((o) => o.id === -1);
      step(s);
    }
    return s;
  }
  ok("a hop clears a rock", lane("rock", true).crashes === 0);
  ok("no hop → the rock trips you", lane("rock", false).crashes === 1);
  ok("a hop does not clear a pine", lane("pine", true).crashes === 1);

  // Ramp air. A "perfect player" presses each trick in the list as soon as
  // the sim will take it (it queues one behind the trick that's turning).
  function rampAir(opts: { tuck: boolean; tricks: number[]; startFrame?: number; steer?: boolean }) {
    const s = freshSim(5);
    s.heading = DOWNHILL;
    s.tuck = opts.tuck;
    s.speed = opts.tuck ? 390 : 300; // topSpeed at the top of the hill is 300
    s.x = 10000;
    s.obstacles = [{ id: -2, kind: "ramp", x: 10000, y: 40 }];
    s.chunks = {};
    s.genCx = Math.floor(s.x / 420);
    s.genCy = 0;
    const todo = [...opts.tricks];
    let launchedAt = -1;
    let airFrames = 0;
    let headingAtLaunch = -1;
    let headingHeld = true;
    for (let k = 0; k < 120; k++) {
      s.obstacles = s.obstacles.filter((o) => o.id === -2);
      step(s);
      if (launchedAt < 0 && s.bigAir) {
        launchedAt = k;
        headingAtLaunch = s.heading;
        if (opts.steer) setSteer(s, 1);
      }
      if (launchedAt < 0) continue;
      if (s.z > 0) {
        airFrames++;
        if (s.heading !== headingAtLaunch) headingHeld = false;
      }
      if (k >= launchedAt + (opts.startFrame ?? 0)) {
        while (todo.length > 0 && pressTrick(s, todo[0])) todo.shift();
      }
    }
    return { s, airS: airFrames * STEP_S, headingHeld };
  }
  const standing = rampAir({ tuck: false, tricks: [] });
  const tucked = rampAir({ tuck: true, tricks: [] });
  ok(
    "a tucked ramp hit flies 40%+ longer than a standing one",
    tucked.airS > standing.airS * 1.4,
    `${standing.airS.toFixed(2)}s vs ${tucked.airS.toFixed(2)}s`,
  );
  const bfDaffy = rampAir({ tuck: false, tricks: [TRICK_BACKFLIP, TRICK_DAFFY] });
  ok(
    "standing: Backflip + Daffy lands clean",
    bfDaffy.s.crashes === 0 && bfDaffy.s.style === 10 + 30 + 10 + 10,
    `style ${bfDaffy.s.style}`,
  );
  const big = [TRICK_BACKFLIP, TRICK_SPIN_L, TRICK_SPIN_R];
  ok("standing: Backflip + two spins doesn't fit", rampAir({ tuck: false, tricks: big }).s.crashKind === "wipeout");
  const bigTucked = rampAir({ tuck: true, tricks: big });
  ok(
    "tucked: Backflip + two spins lands clean",
    bigTucked.s.crashes === 0 && bigTucked.s.style === 10 + 30 + 15 + 15 + 10,
    `style ${bigTucked.s.style}`,
  );
  const late = rampAir({
    tuck: false,
    tricks: [TRICK_BACKFLIP],
    startFrame: Math.round((standing.airS - TRICKS[TRICK_BACKFLIP].s / 2) / STEP_S),
  });
  ok("a trick still turning at touchdown wipes out", late.s.crashes === 1 && late.s.crashKind === "wipeout");
  ok("no steering in ramp air (the arrows are tricks)", rampAir({ tuck: false, tricks: [], steer: true }).headingHeld);
  {
    // Chaining: a press early in a trick is dropped (a double-tap is one
    // trick); in the trick's last CHAIN_WINDOW_S one press queues, not two.
    const q = freshSim(5);
    q.bigAir = true;
    q.z = 30;
    q.vz = 300;
    ok("a double-tap is one trick", pressTrick(q, TRICK_BACKFLIP) && !pressTrick(q, TRICK_BACKFLIP) && q.tricks === 1);
    q.trickT = CHAIN_WINDOW_S;
    ok(
      "in the chain window one trick queues, not two",
      pressTrick(q, TRICK_SPIN_L) && !pressTrick(q, TRICK_SPIN_R) && q.trickNext === TRICK_SPIN_L,
    );
    const g = freshSim(5);
    ok("no tricks on the ground", !pressTrick(g, TRICK_BACKFLIP));
  }
}

console.log(fails === 0 ? "\nall yeti-run checks passed" : `\n${fails} check(s) FAILED`);
process.exit(fails === 0 ? 0 : 1);
