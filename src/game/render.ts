// Yeti Run — Skia render layer.
//
// renderFrame() turns one sim snapshot into one SkPicture: a recorded list of
// draw commands the <Canvas> plays back. Every sprite's pixel art is recorded
// into its own small picture once (spritePicture) and then stamped wherever it
// appears, so a frame is a few dozen drawPicture calls, not thousands of rects.
//
// The camera works like SkiFree's: the skier stays at a fixed spot on screen
// (SKIER_SCREEN_X/Y of the field) and the hill scrolls past.

import {
  createPicture,
  matchFont,
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkFont,
  type SkPaint,
  type SkPicture,
} from '@shopify/react-native-skia';

import {
  FROST,
  GATE_BLUE,
  GATE_GOLD,
  GATE_RED,
  GROUND_FLECKS,
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
  SNOW_SHADE,
  STUMP_ART,
  YETI_A,
  YETI_B,
  YETI_GRAB,
  flagArt,
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

function fill(color: string, opacity = 1): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(false); // crisp pixel edges
  p.setColor(Skia.Color(color));
  if (opacity < 1) p.setAlphaf(opacity);
  return p;
}

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

let bannerFont: SkFont | null = null;
function drawStartBanner(c: SkCanvas) {
  const pole = fill(FROST);
  c.drawRect(r(-118, 72, 3, 66), pole);
  c.drawRect(r(116, 72, 3, 66), pole);
  c.drawRect(r(-120, 138, 240, 2), fill(SNOW_SHADE));
  c.drawRect(r(-124, 66, 248, 26), fill(NAVY_2, 0.9));
  const border = fill(RULE);
  border.setStyle(PaintStyle.Stroke);
  border.setStrokeWidth(1);
  c.drawRect(r(-123.5, 66.5, 247, 25), border);
  bannerFont ??= matchFont({ fontSize: 14, fontWeight: 'bold' });
  const label = 'YETI RUN';
  // Summed glyph widths rather than measureText, which Skia's web/headless
  // build (scripts/preview) doesn't implement.
  const width = bannerFont.getGlyphWidths(bannerFont.getGlyphIDs(label)).reduce((a, b) => a + b, 0);
  c.drawText(label, -width / 2, 84, fill(FROST), bannerFont);
}

// ── The skier ───────────────────────────────────────────────────────────────

const SKIER_H = SKIER_ART.h * SCALE;

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

// ── A whole frame ───────────────────────────────────────────────────────────

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function renderFrame(snap: YetiRunSnapshot, w: number, h: number): SkPicture {
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

    // Painter's algorithm: draw back-to-front by depth (y on the hill), with
    // flat things (moguls, ramps) under anything standing near them and an
    // airborne skier over everything.
    const layers: { z: number; draw: () => void }[] = [];
    if (snap.y < 600) layers.push({ z: 138, draw: () => drawStartBanner(c) });
    for (const o of snap.obstacles) {
      const flat = o.kind === 'mogul' || o.kind === 'ramp';
      layers.push({ z: o.y - (flat ? 40 : 0), draw: () => drawObstacle(c, o) });
    }
    const skierZ = snap.z > 0 ? Infinity : snap.y + (snap.crashT > 0 ? 30 : 1);
    layers.push({ z: skierZ, draw: () => drawSkier(c, snap) });
    if (snap.yeti === 'chase' || snap.yeti === 'caught') {
      const art = snap.yeti === 'caught' ? YETI_GRAB : Math.floor(snap.t * 6) % 2 ? YETI_A : YETI_B;
      layers.push({ z: snap.yetiY, draw: () => stamp(c, art, snap.yetiX, snap.yetiY, YETI_SCALE) });
    }
    layers.sort((a, b) => a.z - b.z);
    for (const l of layers) l.draw();

    c.restore();
  }, r(0, 0, w, h));
}
