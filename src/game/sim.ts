// ============================================
// Yeti Run — the pure sim
// ============================================
// A top-down downhill run in the spirit of the old SkiFree: steer the skier
// down a moonlit slope through pines, rocks and slalom gates, catch air off
// ramps, and keep ahead of the yeti that wakes once you're far enough down.
//
// Determinism contract, so a run (or a future replay / ghost race) is fully
// reproducible from its seed and inputs:
//   - randomness only via seeded RNG — the sim's own `rng` for the yeti, and a
//     pure hash of (seed, chunk) for the slope, so the hill is the same hill
//     whichever order its chunks are visited in
//   - time only via fixed steps (step() advances exactly STEP_S)
//   - no platform APIs; inputs are plain fields set by the exported mutators
//   - state is plain JSON
//
// World coordinates are px with +y DOWNHILL. The run starts at the origin and
// y never decreases (no heading points uphill), so distance is just y. The
// world is unbounded sideways — chunks are generated around the skier on
// demand — and field size never enters the sim: a wider phone sees more of the
// same hill, it doesn't get a different one.

import { rngNext } from "./rng";

export const STEP_S = 1 / 60;
export const MAX_FRAME_S = 0.25;
export const PX_PER_M = 20;

// ── Steering ────────────────────────────────────────────────────────────────
// Seven headings, SkiFree's fan: hard left (stopped, side-on), two diagonals,
// straight down, and their mirrors. Index 3 is the fall line. A heading is
// also a speed: side-on is a stop, which is how you brake.
export const HEADING_DEG = [-90, -60, -30, 0, 30, 60, 90] as const;
export const DOWNHILL = 3;
const LEFTMOST = 0;
const RIGHTMOST = HEADING_DEG.length - 1;
const SPEED_FRAC = [0, 0.45, 0.82, 1, 0.82, 0.45, 0];

const V_BASE = 300; // px/s top speed at the top of the hill (15 m/s)
const V_GAIN = 100; // the slope steepens: +px/s reached by V_GAIN_AT_M
const V_GAIN_AT_M = 1250;
const ACCEL = 240; // px/s² toward a faster heading's speed
const BRAKE = 560; // px/s² toward a slower one — turning across is the brake
const SIDESTEP_V = 80; // px/s shuffle when side-on and still pushing outward
const STEER_FIRST_S = 0.2; // held key: first repeat
const STEER_REPEAT_S = 0.12; // held key: later repeats
const AIM_REPEAT_S = 0.07; // pointer aim swings one heading per this
const SIDESTEP_TAP_S = 0.18; // one outward key press shuffles this long
// Tuck: hold down to crouch on the fall line for more speed. The price is
// steering — the skis stay pinned straight downhill until you stand back up —
// and less time to see the next tree coming.
export const TUCK_FRAC = 1.3; // of top speed

export function topSpeed(distM: number): number {
  return V_BASE + V_GAIN * Math.min(1, distM / V_GAIN_AT_M);
}

// ── Air ─────────────────────────────────────────────────────────────────────
const GRAVITY = 1000; // px/s² (z axis — height above the snow)
// Ramp air scales with how fast you hit it, relative to the hill's top speed:
// straight down ≈0.68s, tucked (×1.3) ≈1.04s, a diagonal ≈0.46s. The tuck is
// how you buy room for a bigger combo.
const RAMP_VZ = 340;
const RAMP_VZ_GAIN = 600; // per unit of (hit speed / top speed) above 1
const RAMP_VZ_MIN = 200;
const RAMP_VZ_MAX = 560;
const RAMP_BOOST = 50; // px/s added leaving a ramp
const HOP_VZ = 190; // a tap's hop: ≈0.38s, apex ≈18px — clears rocks/stumps
const MOGUL_VZ = 160; // a mogul bounces you whether you meant it or not
const HOP_COOLDOWN_S = 0.15;
// Tricks, picked by direction in ramp air (← / → spin, ↑ Daffy, ↓ Backflip).
// Each has its own duration — land while one is still turning and you wipe
// out. A press during a trick queues the next one (one slot), so a combo
// doesn't need frame-perfect timing.
export const TRICKS = [
  { name: "Side spin", s: 0.24, pts: 15 }, // ←
  { name: "Side spin", s: 0.24, pts: 15 }, // →
  { name: "Daffy", s: 0.16, pts: 10 }, // ↑ (and a plain tap)
  { name: "Backflip", s: 0.4, pts: 30 }, // ↓
] as const;
export const TRICK_SPIN_L = 0;
export const TRICK_SPIN_R = 1;
export const TRICK_DAFFY = 2;
export const TRICK_BACKFLIP = 3;
/** A press only chains the next trick in the last this-many seconds of the
 *  one turning; earlier presses are dropped, so a double-tap is one trick. */
export const CHAIN_WINDOW_S = 0.12;
const RAMP_STYLE = 10;
const LANDING_STYLE = 10;
export const CRASH_S = 1.4;

// ── The hill ────────────────────────────────────────────────────────────────
export type ObstacleKind =
  | "pine"
  | "pine-sm"
  | "rock"
  | "stump"
  | "mogul"
  | "ramp"
  | "gate";

// Collision boxes, centred on the obstacle's base point (where it meets the
// snow). `clearZ` is how high the skier must be to pass over: a hop clears a
// rock, only ramp air clears a pine. Gates have no box — they're scored on
// crossing, and the poles are flimsy.
export const HITBOX: Record<
  Exclude<ObstacleKind, "gate">,
  { hw: number; hh: number; clearZ: number }
> = {
  pine: { hw: 9, hh: 6, clearZ: 40 },
  "pine-sm": { hw: 7, hh: 5, clearZ: 24 },
  rock: { hw: 11, hh: 5, clearZ: 6 },
  stump: { hw: 7, hh: 4, clearZ: 6 },
  mogul: { hw: 14, hh: 6, clearZ: 6 },
  ramp: { hw: 17, hh: 6, clearZ: 6 },
};
const SKIER_HW = 7;
const SKIER_HH = 5;
export const GATE_HALF = 52; // half the gap between a gate's two flags
const GATE_REACH = 300; // crossing a gate's line this far wide still counts as a miss
const GATE_STYLE = 10;
const GATE_STREAK_STYLE = 5; // per consecutive gate, capped
const GATE_STREAK_CAP = 4;

const CHUNK = 420; // px per side of one generated cell
const GEN_X = 700; // keep the hill generated this far either side
const GEN_UP = 500;
const GEN_DOWN = 1000;
// The start is a groomed apron: nothing in the first stretch of run, so the
// push-off is never a surprise tree.
const START_CLEAR_X = 260;
const START_CLEAR_Y = 300;

// Kind weights for a placed obstacle (sum 100)
const KIND_WEIGHTS: [ObstacleKind, number][] = [
  ["pine", 30],
  ["pine-sm", 20],
  ["rock", 12],
  ["stump", 8],
  ["mogul", 24],
  ["ramp", 6],
];
// Gates are placed before anything else in a cell (they need a wide open
// lane, which they'd rarely find once the cell has filled up).
const GATE_CHANCE = 0.5;

// ── The yeti ────────────────────────────────────────────────────────────────
// It wakes after YETI_AT_S on the clock, or sooner if the skier is fast enough
// to reach YETI_AT_M first. The clock is the main trigger on purpose: time lost
// to crashes is distance you never get back, which is what makes clean skiing
// worth more than plowing. (It also means standing at the top can't stall a
// run forever.) It starts
// a good way uphill, slower than a clean straight line, and gains a little
// every second: a skier who stays on the fall line outruns it for a while, a
// crash or a long traverse lets it close.
export const YETI_AT_M = 600;
export const YETI_AT_S = 40;
const YETI_WARN_M = 540; // the howl that comes first
const YETI_WARN_S = 35;
const YETI_SPAWN_UP = 540;
const YETI_SPAWN_SIDE = 200;
const YETI_START_FRAC = 0.85; // of the skier's current top speed
const YETI_GAIN = 8; // px/s added per second of chase
const YETI_CATCH_R = 24;

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  /** Already collided with / launched off — never fires twice */
  hit?: boolean;
  /** A gate's verdict once the skier crosses its line */
  gate?: "passed" | "missed";
};

export type YetiState = "asleep" | "howl" | "chase" | "caught";

export type StylePop = { seq: number; label: string; pts: number };

export type YetiRunSim = {
  seed: number;
  rng: number;
  t: number;
  over: boolean;
  // skier
  x: number;
  y: number;
  z: number;
  vz: number;
  heading: number;
  speed: number;
  pushedOff: boolean;
  crashT: number;
  crashes: number;
  /** "tree" for an obstacle, "wipeout" for landing mid-trick */
  crashKind: "tree" | "wipeout" | null;
  crashSeq: number;
  hopCooldown: number;
  /** Air off a ramp (tricks allowed) vs a hop or mogul bounce (not) */
  bigAir: boolean;
  tricks: number;
  trickT: number;
  trickKind: number;
  /** A trick pressed while another was turning (-1 = none) */
  trickNext: number;
  // input
  steerDir: -1 | 0 | 1;
  steerT: number;
  sidestepT: number;
  sidestepDir: -1 | 0 | 1;
  aim: number | null;
  aimSidestep: boolean;
  aimT: number;
  tuck: boolean;
  // score
  distM: number;
  style: number;
  gateStreak: number;
  gatesPassed: number;
  pop: StylePop | null;
  popSeq: number;
  // world
  obstacles: Obstacle[];
  chunks: Record<string, 1>;
  genCx: number;
  genCy: number;
  // yeti
  yeti: YetiState;
  yetiX: number;
  yetiY: number;
  yetiT: number;
};

export function freshSim(seed: number): YetiRunSim {
  const s: YetiRunSim = {
    seed: seed | 0,
    rng: seed | 0,
    t: 0,
    over: false,
    x: 0,
    y: 0,
    z: 0,
    vz: 0,
    // SkiFree's opening pose: standing side-on at the top, going nowhere until
    // you point the skis downhill. (It's also what makes a run you never touch
    // score nothing.)
    heading: RIGHTMOST,
    speed: 0,
    pushedOff: false,
    crashT: 0,
    crashes: 0,
    crashKind: null,
    crashSeq: 0,
    hopCooldown: 0,
    bigAir: false,
    tricks: 0,
    trickT: 0,
    trickKind: 0,
    trickNext: -1,
    steerDir: 0,
    steerT: 0,
    sidestepT: 0,
    sidestepDir: 0,
    aim: null,
    aimSidestep: false,
    aimT: 0,
    tuck: false,
    distM: 0,
    style: 0,
    gateStreak: 0,
    gatesPassed: 0,
    pop: null,
    popSeq: 0,
    obstacles: [],
    chunks: {},
    genCx: Number.NaN,
    genCy: Number.NaN,
    yeti: "asleep",
    yetiX: 0,
    yetiY: 0,
    yetiT: 0,
  };
  generateAround(s);
  return s;
}

export function computeScore(s: YetiRunSim): number {
  return Math.floor(s.distM) + s.style;
}

// ── Input mutators (the hook and any bot call these) ────────────────────────

/** A held left/right key. Turns once on press, then repeats while held. */
export function setSteer(s: YetiRunSim, dir: -1 | 0 | 1): void {
  if (dir === s.steerDir) return;
  s.steerDir = dir;
  if (dir !== 0) {
    turnOnce(s, dir);
    s.steerT = STEER_FIRST_S;
  }
}

/**
 * Pointer aim: swing toward a heading index (null = let go, keep the current
 * heading). `sidestep` means the pointer is level with or above the skier on
 * that side — shuffle across once side-on.
 */
export function setAim(s: YetiRunSim, idx: number | null, sidestep = false): void {
  if (idx === null) {
    s.aim = null;
    s.aimSidestep = false;
    return;
  }
  const clamped = Math.max(LEFTMOST, Math.min(RIGHTMOST, Math.round(idx)));
  if (s.aim !== clamped) s.aimT = 0;
  s.aim = clamped;
  s.aimSidestep = sidestep && (clamped === LEFTMOST || clamped === RIGHTMOST);
}

/** Point straight down the fall line (SkiFree's down key). */
export function pointDownhill(s: YetiRunSim): void {
  if (s.crashT > 0 || s.over || inBigAir(s)) return;
  s.heading = DOWNHILL;
}

/** Hold down: tuck (pinned downhill, faster). Pressing it also points you
 *  downhill, so a tap is still SkiFree's down key. */
export function setTuck(s: YetiRunSim, on: boolean): void {
  s.tuck = on;
  if (on) pointDownhill(s);
}

/** True while the tuck is actually doing something (on the snow, upright). */
export function isTucked(s: YetiRunSim): boolean {
  return s.tuck && s.crashT <= 0 && s.z <= 0 && s.vz <= 0;
}

/** Off a ramp and still in the air — where the arrows do tricks, not turns. */
export function inBigAir(s: YetiRunSim): boolean {
  return s.bigAir && (s.z > 0 || s.vz > 0) && s.crashT <= 0;
}

/** Tap / space: a hop on the snow, a Daffy in ramp air. */
export function pressAction(s: YetiRunSim): void {
  if (s.crashT > 0 || s.over) return;
  const airborne = s.z > 0 || s.vz > 0;
  if (!airborne) {
    if (s.hopCooldown > 0) return;
    launch(s, HOP_VZ, false);
    return;
  }
  pressTrick(s, TRICK_DAFFY);
}

/** A trick by index into TRICKS. Starts now, or — in the trick's last
 *  CHAIN_WINDOW_S — queues behind the one turning. Returns false if it was
 *  ignored (not in ramp air, too early to chain, or the queue is full). */
export function pressTrick(s: YetiRunSim, kind: number): boolean {
  if (s.over || !inBigAir(s) || !TRICKS[kind]) return false;
  if (s.trickT <= 0) {
    startTrick(s, kind);
    return true;
  }
  if (s.trickNext >= 0 || s.trickT > CHAIN_WINDOW_S) return false;
  s.trickNext = kind;
  return true;
}

function startTrick(s: YetiRunSim, kind: number): void {
  s.trickKind = kind;
  s.trickT = TRICKS[kind].s;
  s.tricks++;
}

function turnOnce(s: YetiRunSim, dir: -1 | 1): void {
  if (s.crashT > 0 || s.over || inBigAir(s)) return;
  if ((dir < 0 && s.heading === LEFTMOST) || (dir > 0 && s.heading === RIGHTMOST)) {
    s.sidestepT = SIDESTEP_TAP_S;
    s.sidestepDir = dir;
    return;
  }
  s.heading = Math.max(LEFTMOST, Math.min(RIGHTMOST, s.heading + dir));
}

function launch(s: YetiRunSim, vz: number, big: boolean): void {
  s.vz = vz;
  s.z = Math.max(s.z, 0.01);
  s.bigAir = big;
  s.tricks = 0;
  s.trickT = 0;
  s.trickNext = -1;
}

function popStyle(s: YetiRunSim, label: string, pts: number): void {
  s.style += pts;
  s.popSeq++;
  s.pop = { seq: s.popSeq, label, pts };
}

function crash(s: YetiRunSim, kind: "tree" | "wipeout", awayFromX: number | null): void {
  s.crashT = CRASH_S;
  s.crashKind = kind;
  s.crashSeq++;
  s.crashes++;
  s.speed = 0;
  s.z = 0;
  s.vz = 0;
  s.trickT = 0;
  s.trickNext = -1;
  s.bigAir = false;
  s.gateStreak = 0;
  s.sidestepT = 0;
  // Back on your feet side-on, facing away from whatever you hit — like
  // SkiFree, you choose when to point downhill again.
  if (awayFromX !== null) s.heading = s.x < awayFromX ? LEFTMOST : RIGHTMOST;
  else s.heading = s.heading < DOWNHILL ? LEFTMOST : RIGHTMOST;
}

// ── The hill generator ──────────────────────────────────────────────────────

function hash32(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b + 0x632be59b, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 13), 0x27d4eb2f);
  h ^= Math.imul(c + 0x165667b1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 15)) | 0;
}

function pickKind(r: number): ObstacleKind {
  let acc = 0;
  for (const [kind, w] of KIND_WEIGHTS) {
    acc += w / 100;
    if (r < acc) return kind;
  }
  return "pine";
}

/** Everything in one chunk — a pure function of (seed, cx, cy). */
export function generateChunk(seed: number, cx: number, cy: number): Obstacle[] {
  let st = hash32(seed, cx, cy);
  const next = () => {
    const r = rngNext(st);
    st = r.state;
    return r.value;
  };
  // Busier the further down the hill: 8 per cell at the top, 14 by 1.2 km.
  // Dense enough that pointing straight down and never steering meets a tree
  // every few seconds — steering is the game, not an optional extra.
  const depthM = Math.max(0, (cy * CHUNK) / PX_PER_M);
  const count = 8 + Math.min(6, Math.floor(depthM / 200));
  const placed: Obstacle[] = [];
  if (next() < GATE_CHANCE) {
    const x = cx * CHUNK + 80 + next() * (CHUNK - 160);
    const y = cy * CHUNK + 60 + next() * (CHUNK - 120);
    if (!(y < START_CLEAR_Y && Math.abs(x) < START_CLEAR_X)) {
      const id = ((cy + 4096) * 8192 + (cx + 4096)) * 16 + 15;
      placed.push({ id, kind: "gate", x: Math.round(x), y: Math.round(y) });
    }
  }
  for (let attempt = 0; attempt < count * 4 && placed.length < count; attempt++) {
    const x = cx * CHUNK + next() * CHUNK;
    const y = cy * CHUNK + next() * CHUNK;
    const kind = pickKind(next());
    if (y < START_CLEAR_Y && Math.abs(x) < START_CLEAR_X) continue;
    // Gates need an open lane through them; everything else just shouldn't
    // stack. The larger of the two clearances wins.
    const need = kind === "gate" ? 96 : 40;
    const crowded = placed.some((o) => {
      const r = Math.max(need, o.kind === "gate" ? 96 : 40);
      return Math.abs(o.x - x) < r && Math.abs(o.y - y) < r;
    });
    if (crowded) continue;
    // Ids are unique per (chunk, index) so React keys and hit flags survive
    // regeneration order.
    const id = ((cy + 4096) * 8192 + (cx + 4096)) * 16 + Math.min(14, placed.length);
    placed.push({ id, kind, x: Math.round(x), y: Math.round(y) });
  }
  return placed;
}

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function generateAround(s: YetiRunSim): void {
  const cx = Math.floor(s.x / CHUNK);
  const cy = Math.floor(s.y / CHUNK);
  if (cx === s.genCx && cy === s.genCy) return;
  s.genCx = cx;
  s.genCy = cy;
  const x0 = Math.floor((s.x - GEN_X) / CHUNK);
  const x1 = Math.floor((s.x + GEN_X) / CHUNK);
  const y0 = Math.floor((s.y - GEN_UP) / CHUNK);
  const y1 = Math.floor((s.y + GEN_DOWN) / CHUNK);
  for (let gy = y0; gy <= y1; gy++) {
    for (let gx = x0; gx <= x1; gx++) {
      const key = chunkKey(gx, gy);
      if (s.chunks[key]) continue;
      s.chunks[key] = 1;
      for (const o of generateChunk(s.seed, gx, gy)) s.obstacles.push(o);
    }
  }
  // Forget what's well behind or well off to the side. A chunk forgotten
  // sideways regenerates identically if the skier comes back (minus its hit
  // flags, which is fine); one forgotten uphill is never seen again.
  const keepX0 = x0 - 1;
  const keepX1 = x1 + 1;
  const keepY0 = y0 - 1;
  s.obstacles = s.obstacles.filter((o) => {
    const ox = Math.floor(o.x / CHUNK);
    const oy = Math.floor(o.y / CHUNK);
    return oy >= keepY0 && ox >= keepX0 && ox <= keepX1;
  });
  for (const key of Object.keys(s.chunks)) {
    const [kx, ky] = key.split(",").map(Number);
    if (ky < keepY0 || kx < keepX0 || kx > keepX1) delete s.chunks[key];
  }
}

// ── The step ────────────────────────────────────────────────────────────────

/** Advance exactly STEP_S. Returns false once the yeti has caught the skier. */
export function step(s: YetiRunSim): boolean {
  if (s.over) return false;
  const dt = STEP_S;
  s.t += dt;
  if (s.hopCooldown > 0) s.hopCooldown = Math.max(0, s.hopCooldown - dt);

  // Steering — none while sprawled in the snow, none in ramp air (the arrows
  // are tricks up there), and none while tucked (getting up from a crash with
  // the tuck still held drops straight back into it).
  if (s.crashT > 0) {
    s.crashT = Math.max(0, s.crashT - dt);
  } else if (inBigAir(s)) {
    // hold the heading you took off with
  } else if (s.tuck) {
    s.heading = DOWNHILL;
  } else {
    if (s.aim !== null) {
      s.aimT -= dt;
      if (s.aimT <= 0 && s.heading !== s.aim) {
        s.heading += s.aim > s.heading ? 1 : -1;
        s.aimT = AIM_REPEAT_S;
      }
    } else if (s.steerDir !== 0) {
      s.steerT -= dt;
      if (s.steerT <= 0) {
        turnOnce(s, s.steerDir);
        s.steerT = STEER_REPEAT_S;
      }
    }
  }

  const airborne = s.z > 0 || s.vz > 0;
  // Speed eases toward the heading's share of top speed. In the air you keep
  // what you launched with — there's no snow to brake against.
  if (!airborne && s.crashT <= 0) {
    const target = topSpeed(s.distM) * SPEED_FRAC[s.heading] * (s.tuck ? TUCK_FRAC : 1);
    if (s.speed < target) s.speed = Math.min(target, s.speed + ACCEL * dt);
    else s.speed = Math.max(target, s.speed - BRAKE * dt);
  }
  if (s.speed > 0) s.pushedOff = true;

  const rad = (HEADING_DEG[s.heading] * Math.PI) / 180;
  const prevY = s.y;
  s.x += Math.sin(rad) * s.speed * dt;
  s.y += Math.cos(rad) * s.speed * dt;
  // Side-on shuffle (keyboard tap, or pointer held out to the side)
  if (s.crashT <= 0 && !airborne) {
    if (s.sidestepT > 0) {
      s.sidestepT = Math.max(0, s.sidestepT - dt);
      s.x += s.sidestepDir * SIDESTEP_V * dt;
    } else if (s.aimSidestep && s.aim === s.heading) {
      s.x += (s.heading === LEFTMOST ? -1 : 1) * SIDESTEP_V * dt;
    }
  }

  // Air
  if (airborne) {
    s.vz -= GRAVITY * dt;
    s.z += s.vz * dt;
    if (s.trickT > 0) {
      s.trickT -= dt;
      if (s.trickT <= 0) {
        s.trickT = 0;
        popStyle(s, TRICKS[s.trickKind].name, TRICKS[s.trickKind].pts);
        if (s.trickNext >= 0) {
          startTrick(s, s.trickNext);
          s.trickNext = -1;
        }
      }
    }
    if (s.z <= 0) {
      s.z = 0;
      s.vz = 0;
      s.hopCooldown = HOP_COOLDOWN_S;
      if (s.trickT > 0) {
        // Landed mid-trick — SkiFree's classic faceplant.
        crash(s, "wipeout", null);
      } else {
        if (s.bigAir) popStyle(s, "Clean landing", LANDING_STYLE);
        s.bigAir = false;
        s.tricks = 0;
      }
    }
  }

  generateAround(s);

  // Collisions
  if (s.crashT <= 0) {
    for (const o of s.obstacles) {
      if (o.hit || o.kind === "gate") continue;
      const hb = HITBOX[o.kind];
      if (Math.abs(s.x - o.x) >= hb.hw + SKIER_HW) continue;
      if (Math.abs(s.y - o.y) >= hb.hh + SKIER_HH) continue;
      if (s.z >= hb.clearZ) continue;
      if (o.kind === "mogul") {
        o.hit = true;
        if (s.z <= 0 && s.vz <= 0) launch(s, MOGUL_VZ, false);
        continue;
      }
      if (o.kind === "ramp") {
        o.hit = true;
        const hit = s.speed / topSpeed(s.distM);
        const vz = RAMP_VZ + RAMP_VZ_GAIN * (hit - 1);
        launch(s, Math.max(RAMP_VZ_MIN, Math.min(RAMP_VZ_MAX, vz)), true);
        s.speed += RAMP_BOOST;
        popStyle(s, "Air", RAMP_STYLE);
        continue;
      }
      o.hit = true;
      crash(s, "tree", o.x);
      break;
    }
  }

  // Gates — scored when the skier crosses a gate's line
  if (s.y > prevY) {
    for (const o of s.obstacles) {
      if (o.kind !== "gate" || o.gate) continue;
      if (!(prevY < o.y && s.y >= o.y)) continue;
      const dx = Math.abs(s.x - o.x);
      if (dx < GATE_HALF) {
        o.gate = "passed";
        s.gatesPassed++;
        const pts = GATE_STYLE + GATE_STREAK_STYLE * Math.min(s.gateStreak, GATE_STREAK_CAP);
        s.gateStreak++;
        popStyle(s, s.gateStreak > 1 ? `Gate ×${s.gateStreak}` : "Gate", pts);
      } else if (dx < GATE_REACH) {
        o.gate = "missed";
        s.gateStreak = 0;
      }
    }
  }

  s.distM = Math.max(s.distM, s.y / PX_PER_M);

  // The yeti
  if (s.yeti === "asleep" && (s.distM >= YETI_WARN_M || s.t >= YETI_WARN_S)) {
    s.yeti = "howl";
  }
  if (s.yeti === "howl" && (s.distM >= YETI_AT_M || s.t >= YETI_AT_S)) {
    const r = rngNext(s.rng);
    s.rng = r.state;
    s.yeti = "chase";
    s.yetiX = s.x + (r.value < 0.5 ? -1 : 1) * YETI_SPAWN_SIDE;
    s.yetiY = s.y - YETI_SPAWN_UP;
    s.yetiT = 0;
  }
  if (s.yeti === "chase") {
    s.yetiT += dt;
    const v = topSpeed(s.distM) * YETI_START_FRAC + YETI_GAIN * s.yetiT;
    const dx = s.x - s.yetiX;
    const dy = s.y - s.yetiY;
    const d = Math.hypot(dx, dy);
    if (d <= YETI_CATCH_R + v * dt) {
      s.yetiX = s.x;
      s.yetiY = s.y;
      s.yeti = "caught";
      s.over = true;
      return false;
    }
    s.yetiX += (dx / d) * v * dt;
    s.yetiY += (dy / d) * v * dt;
  }
  return true;
}

/** Metres between the yeti and the skier (Infinity while it sleeps). */
export function yetiGapM(s: YetiRunSim): number {
  if (s.yeti !== "chase") return s.yeti === "caught" ? 0 : Infinity;
  return Math.hypot(s.x - s.yetiX, s.y - s.yetiY) / PX_PER_M;
}

// ── Snapshot (what the render layer re-renders from) ────────────────────────

export type YetiRunSnapshot = {
  t: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  pushedOff: boolean;
  tucked: boolean;
  crashT: number;
  crashKind: YetiRunSim["crashKind"];
  crashSeq: number;
  bigAir: boolean;
  trickT: number;
  trickKind: number;
  distM: number;
  style: number;
  score: number;
  gatesPassed: number;
  pop: StylePop | null;
  obstacles: Obstacle[];
  yeti: YetiState;
  yetiX: number;
  yetiY: number;
  yetiT: number;
  yetiGapM: number;
};

/** Copy out the render state, keeping only obstacles inside the view rect
 *  (relative to the skier) so React never diffs the whole generated hill. */
export function snapshotOf(
  s: YetiRunSim,
  view: { left: number; right: number; up: number; down: number },
): YetiRunSnapshot {
  const obstacles: Obstacle[] = [];
  for (const o of s.obstacles) {
    const dx = o.x - s.x;
    const dy = o.y - s.y;
    if (dx < -view.left || dx > view.right || dy < -view.up || dy > view.down) continue;
    obstacles.push({ ...o });
  }
  return {
    t: s.t,
    x: s.x,
    y: s.y,
    z: s.z,
    heading: s.heading,
    speed: s.speed,
    pushedOff: s.pushedOff,
    tucked: isTucked(s),
    crashT: s.crashT,
    crashKind: s.crashKind,
    crashSeq: s.crashSeq,
    bigAir: s.bigAir,
    trickT: s.trickT,
    trickKind: s.trickKind,
    distM: s.distM,
    style: s.style,
    score: computeScore(s),
    gatesPassed: s.gatesPassed,
    pop: s.pop,
    obstacles,
    yeti: s.yeti,
    yetiX: s.yetiX,
    yetiY: s.yetiY,
    yetiT: s.yetiT,
    yetiGapM: yetiGapM(s),
  };
}
