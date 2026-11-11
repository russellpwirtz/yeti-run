// Yeti Run — Skia render layer.
//
// renderFrame() turns one sim snapshot into one SkPicture: a recorded list of
// draw commands the <Canvas> plays back. Every sprite's pixel art is recorded
// into its own small picture once (spritePicture) and then stamped wherever it
// appears, so a frame is a few dozen drawPicture calls, not thousands of rects.
//
// The camera works like SkiFree's: the skier stays at a fixed spot on screen
// (SKIER_SCREEN_X/Y of the field) and the hill scrolls past.
//
// On top of the hill, in screen space: falling snow and the score pop-ups.

import {
  createPicture,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkPaint,
  type SkPicture,
} from '@shopify/react-native-skia';

import {
  FROST,
  GATE_BLUE,
  GATE_GOLD,
  GATE_RED,
  GROUND_FLECKS,
  NAVY,
  GROUND_TILE,
  MOGUL_ART,
  NAVY_2,
  NAVY_3,
  PINE_ART,
  PINE_SM_ART,
  RAMP_ART,
  ROCK_ART,
  RULE,
  SKI,
  SKI_TIP,
  SKIER_ART,
  SNOW,
  SNOW_DEEP,
  SNOW_HI,
  SNOW_SHADE,
  STUMP_ART,
  YETI_A,
  YETI_B,
  YETI_CHEW_A,
  YETI_CHEW_B,
  YETI_GRAB,
  YETI_GULP,
  YETI_HOP_A,
  YETI_HOP_B,
  flagArt,
  pixelText,
  type Art,
} from './art';
import {
  CRASH_S,
  GATE_HALF,
  HEADING_DEG,
  TRICKS,
  TRICK_BACKFLIP,
  TRICK_DAFFY,
  TRICK_SPIN_L,
  TRICK_SPIN_R,
  type Obstacle,
  type YetiRunSnapshot,
} from './sim';
import type { TrackSeg } from './engine';
import type { LivePop, PopTone } from './pops';

export const SCALE = 3; // screen px per art px
export const YETI_SCALE = 4; // the yeti is bigger than everything else on the hill
export const SKIER_SCREEN_X = 0.5;
export const SKIER_SCREEN_Y = 0.3;

/** The rect around the skier worth snapshotting for a field of w × h. */
export function viewFor(w: number, h: number) {
  return {
    left: w * SKIER_SCREEN_X + 60,
    right: w * (1 - SKIER_SCREEN_X) + 60,
    up: h * SKIER_SCREEN_Y + 40,
    down: h * (1 - SKIER_SCREEN_Y) + 90,
  };
}

// ── Paint helpers ───────────────────────────────────────────────────────────

// Paints are cached by color + opacity: frames are drawn 60 times a second, and
// most shapes share a handful of colors. Treat returned paints as read-only.
const paints = new Map<string, SkPaint>();
function fill(color: string, opacity = 1): SkPaint {
  const key = `${color}/${opacity}`;
  let p = paints.get(key);
  if (!p) {
    p = Skia.Paint();
    p.setAntiAlias(false); // crisp pixel edges
    p.setColor(Skia.Color(color));
    if (opacity < 1) p.setAlphaf(opacity);
    paints.set(key, p);
  }
  return p;
}

let borderPaint: SkPaint | null = null;
let trackPaint: SkPaint | null = null;

const r = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);

// ── Sprite pictures (recorded once, stamped many times) ─────────────────────

const pictures = new Map<Art, Map<number, SkPicture>>();

function spritePicture(art: Art, scale: number): SkPicture {
  let byScale = pictures.get(art);
  if (!byScale) pictures.set(art, (byScale = new Map()));
  let pic = byScale.get(scale);
  if (!pic) {
    pic = createPicture((c) => {
      for (const [x, y, w, h, color, opacity] of art.px) {
        c.drawRect(r(x * scale, y * scale, w * scale, h * scale), fill(color, opacity));
      }
    }, r(0, 0, art.w * scale, art.h * scale));
    byScale.set(scale, pic);
  }
  return pic;
}

let groundPic: SkPicture | null = null;
function groundPicture(): SkPicture {
  return (groundPic ??= createPicture((c) => {
    for (const [x, y, w, h, color, opacity] of GROUND_FLECKS) {
      c.drawRect(r(x, y, w, h), fill(color, opacity));
    }
  }, r(0, 0, GROUND_TILE, GROUND_TILE)));
}

/** A sprite standing on the snow: its art's bottom-centre sits on (x, y). */
function stamp(c: SkCanvas, art: Art, x: number, y: number, scale = SCALE, opacity = 1) {
  c.save();
  c.translate(Math.round(x - (art.w * scale) / 2), Math.round(y - art.h * scale + scale));
  if (opacity < 1) c.saveLayer(fill('#000000', opacity));
  c.drawPicture(spritePicture(art, scale));
  if (opacity < 1) c.restore();
  c.restore();
}

// ── World furniture ─────────────────────────────────────────────────────────

const FLAG_LEFT = flagArt(GATE_RED, 'left');
const FLAG_RIGHT = flagArt(GATE_BLUE, 'right');
const FLAG_LEFT_DONE = flagArt(GATE_GOLD, 'left');
const FLAG_RIGHT_DONE = flagArt(GATE_GOLD, 'right');

const ART_BY_KIND: Record<Exclude<Obstacle['kind'], 'gate'>, Art> = {
  pine: PINE_ART,
  'pine-sm': PINE_SM_ART,
  rock: ROCK_ART,
  stump: STUMP_ART,
  mogul: MOGUL_ART,
  ramp: RAMP_ART,
};

function drawObstacle(c: SkCanvas, o: Obstacle) {
  if (o.kind === 'gate') {
    const passed = o.gate === 'passed';
    const dim = o.gate === 'missed' ? 0.45 : 1;
    stamp(c, passed ? FLAG_LEFT_DONE : FLAG_LEFT, o.x - GATE_HALF, o.y, SCALE, dim);
    stamp(c, passed ? FLAG_RIGHT_DONE : FLAG_RIGHT, o.x + GATE_HALF, o.y, SCALE, dim);
    return;
  }
  stamp(c, ART_BY_KIND[o.kind], o.x, o.y);
}

const BANNER_TITLE = pixelText('YETI RUN', FROST);

function drawStartBanner(c: SkCanvas) {
  const pole = fill(FROST);
  c.drawRect(r(-118, 72, 3, 66), pole);
  c.drawRect(r(116, 72, 3, 66), pole);
  c.drawRect(r(-120, 138, 240, 2), fill(SNOW_SHADE));
  c.drawRect(r(-124, 66, 248, 26), fill(NAVY_2, 0.9));
  if (!borderPaint) {
    borderPaint = fill(RULE).copy();
    borderPaint.setStyle(PaintStyle.Stroke);
    borderPaint.setStrokeWidth(1);
  }
  c.drawRect(r(-123.5, 66.5, 247, 25), borderPaint);
  stamp(c, BANNER_TITLE, 0, 83, 2);
}

// Ski tracks: two grooves per segment, offset either side of the line of travel.
function drawTracks(c: SkCanvas, segs: readonly TrackSeg[]) {
  if (!trackPaint) {
    trackPaint = fill(SNOW_DEEP, 0.55).copy();
    trackPaint.setStyle(PaintStyle.Stroke);
    trackPaint.setStrokeWidth(2);
  }
  for (const seg of segs) {
    if (seg.length < 2) continue;
    for (const sign of [1, -1]) {
      const path = Skia.PathBuilder.Make();
      seg.forEach((p, i) => {
        const rad = (HEADING_DEG[p.heading] * Math.PI) / 180;
        const x = p.x + Math.cos(rad) * 4 * sign;
        const y = p.y - Math.sin(rad) * 4 * sign;
        if (i === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
      c.drawPath(path.detach(), trackPaint);
    }
  }
}

// ── The catch ───────────────────────────────────────────────────────────────

// As in SkiFree, the yeti eats the skier: holds them up, gulps them down,
// chews, then hops about. Milliseconds since the catch.
export const EAT_GRAB_MS = 500;
export const EAT_GULP_MS = 850;
const EAT_CHEW_MS = 2050;
const EAT_HOP_MS = 2750;
/** How long the catch plays before the end-of-run panel. */
export const CATCH_BEAT_MS = 2950;

function yetiEatFrame(ms: number): Art {
  if (ms < EAT_GRAB_MS) return YETI_GRAB;
  if (ms < EAT_GULP_MS) return YETI_GULP;
  if (ms < EAT_CHEW_MS) return Math.floor((ms - EAT_GULP_MS) / 150) % 2 === 0 ? YETI_CHEW_A : YETI_CHEW_B;
  if (ms < EAT_HOP_MS) return Math.floor((ms - EAT_CHEW_MS) / 175) % 2 === 0 ? YETI_HOP_A : YETI_HOP_B;
  return YETI_HOP_B;
}

const YETI_HANDS = 21 * YETI_SCALE; // raised hands, px above the yeti's feet
const YETI_MOUTH = 18 * YETI_SCALE; // its mouth, px above its feet

function drawYeti(c: SkCanvas, snap: YetiRunSnapshot, eatMs: number | null) {
  if (eatMs === null) {
    const art = Math.floor(snap.t * 6) % 2 ? YETI_A : YETI_B;
    stamp(c, art, snap.yetiX, snap.yetiY, YETI_SCALE);
    return;
  }
  const art = yetiEatFrame(eatMs);
  const hop = art === YETI_HOP_A ? 3 * YETI_SCALE : 0;
  stamp(c, art, snap.yetiX, snap.yetiY - hop, YETI_SCALE);
}

/** Caught: the skier rides on the yeti's raised hands, then goes into its mouth. */
function drawCaughtSkier(c: SkCanvas, snap: YetiRunSnapshot, eatMs: number) {
  if (eatMs >= EAT_GULP_MS) return; // inside the yeti now
  const gulpP = Math.min(1, Math.max(0, (eatMs - EAT_GRAB_MS) / (EAT_GULP_MS - EAT_GRAB_MS)));
  const mid = -SKIER_H / 2;
  // Feet on the hands (bobbing while held up), sliding down so the body's
  // middle ends at the mouth.
  const held = YETI_HANDS + (gulpP === 0 ? 3 - 3 * Math.cos((eatMs / 500) * 2 * Math.PI) : 0);
  const lift = held + (YETI_MOUTH + mid - held) * gulpP;
  c.save();
  c.translate(Math.round(snap.x), Math.round(snap.y - lift));
  if (gulpP > 0) {
    c.translate(0, mid);
    c.rotate(gulpP * 200, 0, 0);
    c.scale(1 - 0.9 * gulpP, 1 - 0.9 * gulpP);
    c.translate(0, -mid);
  }
  stamp(c, SKIER_ART, 0, 0);
  c.restore();
}

// ── The skier ───────────────────────────────────────────────────────────────

export const SKIER_H = SKIER_ART.h * SCALE;

function drawSkis(c: SkCanvas, deg: number, crashed: boolean, daffy: boolean) {
  // The skis point along the direction of travel, squashed into the same
  // three-quarter view as everything else.
  c.save();
  c.scale(1, 0.55);
  c.rotate(90 - deg, 0, 0);
  for (const side of [-1, 1]) {
    c.save();
    c.rotate(crashed ? side * 38 : 0, 0, 0);
    c.translate(daffy ? side * 7 : 0, side * 3.5);
    c.drawRect(r(-15, -1.5, 30, 3), fill(SKI));
    c.drawRect(r(12, -1.5, 3, 3), fill(SKI_TIP));
    c.restore();
  }
  c.restore();
}

function drawSkier(c: SkCanvas, snap: YetiRunSnapshot) {
  const deg = HEADING_DEG[snap.heading];
  const facing = deg < 0 ? -1 : 1;
  const crashed = snap.crashT > 0;
  const airborne = snap.z > 0;
  const trickP = snap.trickT > 0 ? 1 - snap.trickT / TRICKS[snap.trickKind].s : null;
  const trick = trickP !== null ? snap.trickKind : null;
  const bob = !airborne && !crashed && snap.speed > 30 ? Math.round(Math.sin(snap.t * 16)) : 0;

  // Shadow on the snow — shrinks as the skier rises
  const shrink = Math.min(20, snap.z * 0.2);
  c.drawOval(
    r(snap.x - 16 + shrink / 2, snap.y - 4, 32 - shrink, 7),
    fill(NAVY_3, airborne ? 0.22 : 0.16),
  );

  c.save();
  c.translate(Math.round(snap.x), Math.round(snap.y - snap.z) + bob);
  drawSkis(c, deg, crashed, trick === TRICK_DAFFY);

  // Body transforms pivot on the feet (0, 0) or the body's middle (0, mid).
  const mid = -SKIER_H / 2;
  c.scale(facing, 1);
  if (crashed) {
    // Sprawled on the snow, sliding to a stop over the first half second
    const settle = Math.min(1, (CRASH_S - snap.crashT) / 0.5);
    c.translate(-20 * settle, 0);
    c.rotate(84 * settle, 0, 0);
  } else {
    c.rotate(Math.sin((2 * deg * Math.PI) / 180) * 8, 0, 0); // lean into the carve
    if (trickP !== null && (trick === TRICK_SPIN_L || trick === TRICK_SPIN_R)) {
      // Spins turn the way you pressed, whichever way the body is facing
      const dir = trick === TRICK_SPIN_L ? -1 : 1;
      c.rotate(dir * facing * trickP * 360, 0, mid);
    }
    if (trickP !== null && trick === TRICK_BACKFLIP) {
      c.translate(0, mid);
      c.scale(1, Math.cos(trickP * 2 * Math.PI));
      c.translate(0, -mid);
    }
    if (trick === TRICK_DAFFY) c.rotate(-14, 0, mid);
    if (snap.tucked) c.scale(1, 0.84);
  }
  stamp(c, SKIER_ART, 0, 0);
  c.restore();
}

// ── Falling snow ────────────────────────────────────────────────────────────

// Two sparse flake tiles at different sizes, scrolled faster than the ground
// (k) and drifting down on their own (drift px/s), so they read as near the
// camera. Flakes are [x, y, size].
const SNOW_LAYERS = [
  { size: 149, k: 1.15, drift: 22, flakes: [[10, 60, 2], [90, 20, 2], [60, 110, 1], [130, 90, 2], [40, 140, 1], [110, 130, 1]] },
  { size: 211, k: 1.4, drift: 38, flakes: [[20, 30, 3], [120, 80, 3], [70, 170, 3], [180, 140, 2], [160, 20, 2]] },
] as const;

function drawSnowfall(c: SkCanvas, w: number, h: number, camX: number, camY: number, t: number) {
  const flake = fill('#ffffff', 0.85);
  for (const { size, k, drift, flakes } of SNOW_LAYERS) {
    const ox = mod(camX * k + t * drift * 0.4, size);
    const oy = mod(camY * k + t * drift, size);
    for (let tx = ox - size; tx < w; tx += size) {
      for (let ty = oy - size; ty < h; ty += size) {
        for (const [x, y, d] of flakes) c.drawRect(r(Math.round(tx + x), Math.round(ty + y), d, d), flake);
      }
    }
  }
}

// ── Score pop-ups ───────────────────────────────────────────────────────────

const POP_COLOR: Record<PopTone, string> = { gate: GATE_GOLD, style: SNOW_HI, bad: '#ffd2d3' };
const POP_SCALE = 3;
const POP_IN = 0.32; // fraction of its life a pop spends rising into place

function drawPop(c: SkCanvas, p: LivePop, x: number, y: number) {
  const inP = Math.min(1, p.age / POP_IN);
  const ease = 1 - (1 - inP) * (1 - inP);
  const py = y + 6 + (-22 - p.slot * 14) * ease;
  const fadeOut = p.age > 0.75 ? 1 - (p.age - 0.75) / 0.25 : 1;
  const opacity = Math.max(0, Math.min(inP * 2, fadeOut, 1));
  if (opacity <= 0) return;
  const text = pixelText(p.text, POP_COLOR[p.tone]);
  const outline = pixelText(p.text, NAVY);
  c.saveLayer(fill('#000000', opacity));
  // A 1px navy outline, so the text reads on white snow
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    stamp(c, outline, x + dx, py + dy, POP_SCALE);
  }
  stamp(c, text, x, py, POP_SCALE);
  c.restore();
}

// ── A whole frame ───────────────────────────────────────────────────────────

const mod = (a: number, n: number) => ((a % n) + n) % n;

export type FrameExtras = {
  tracks?: readonly TrackSeg[];
  pops?: readonly LivePop[];
  /** Milliseconds since the yeti caught the skier (the eating animation). */
  eatMs?: number | null;
  /** Seconds for the snowfall's drift; null turns the snowfall off (reduced motion). */
  snowT?: number | null;
};

export function renderFrame(
  snap: YetiRunSnapshot,
  w: number,
  h: number,
  { tracks = [], pops = [], eatMs = null, snowT = snap.t }: FrameExtras = {},
): SkPicture {
  return createPicture((c) => {
    c.drawColor(Skia.Color(SNOW));
    const camX = Math.round(w * SKIER_SCREEN_X - snap.x);
    const camY = Math.round(h * SKIER_SCREEN_Y - snap.y);

    // Ground texture, tiled and scrolled with the camera
    const ground = groundPicture();
    for (let gx = mod(camX, GROUND_TILE) - GROUND_TILE; gx < w; gx += GROUND_TILE) {
      for (let gy = mod(camY, GROUND_TILE) - GROUND_TILE; gy < h; gy += GROUND_TILE) {
        c.save();
        c.translate(gx, gy);
        c.drawPicture(ground);
        c.restore();
      }
    }

    // Everything in world coordinates from here
    c.save();
    c.translate(camX, camY);
    drawTracks(c, tracks); // pressed into the snow, under everything

    // Painter's algorithm: draw back-to-front by depth (y on the hill), with
    // flat things (moguls, ramps) under anything standing near them and an
    // airborne skier over everything.
    const layers: { z: number; draw: () => void }[] = [];
    if (snap.y < 600) layers.push({ z: 138, draw: () => drawStartBanner(c) });
    for (const o of snap.obstacles) {
      const flat = o.kind === 'mogul' || o.kind === 'ramp';
      layers.push({ z: o.y - (flat ? 40 : 0), draw: () => drawObstacle(c, o) });
    }
    const caught = snap.yeti === 'caught';
    const eat = caught ? (eatMs ?? 0) : null;
    if (eat !== null) {
      // Held up in front of the yeti
      layers.push({ z: snap.yetiY + 1, draw: () => drawCaughtSkier(c, snap, eat) });
    } else {
      const skierZ = snap.z > 0 ? Infinity : snap.y + (snap.crashT > 0 ? 30 : 1);
      layers.push({ z: skierZ, draw: () => drawSkier(c, snap) });
    }
    if (snap.yeti === 'chase' || caught) {
      layers.push({ z: snap.yetiY, draw: () => drawYeti(c, snap, eat) });
    }
    layers.sort((a, b) => a.z - b.z);
    for (const l of layers) l.draw();

    c.restore();

    // Screen space: snow nearer the camera than the hill, then the pop-ups
    // floating over the skier's head.
    if (snowT !== null) drawSnowfall(c, w, h, camX, camY, snowT);
    const headX = w * SKIER_SCREEN_X;
    const headY = h * SKIER_SCREEN_Y - SKIER_H - 18 - snap.z;
    for (const p of pops) drawPop(c, p, headX, headY);
  }, r(0, 0, w, h));
}
