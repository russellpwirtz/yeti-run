// The title screen's picture: a real game frame (an autopilot run, like an
// arcade cabinet's attract mode) with the wordmark, tagline and best score
// drawn over it in the game's own pixel lettering.

import { createPicture, Skia, TileMode, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';

import { FROST, GATE_GOLD, NAVY, pixelText, type Art } from './art';
import { renderFrame, stamp, type FrameExtras } from './render';
import type { YetiRunSnapshot } from './sim';

/** The skier sits lower than in a run, leaving the top for the wordmark. */
export const TITLE_SKIER_Y = 0.56;

const WORD_1 = pixelText('YETI', FROST);
const WORD_2 = pixelText('RUN', FROST);
const WORD_1_SHADOW = pixelText('YETI', NAVY);
const WORD_2_SHADOW = pixelText('RUN', NAVY);
const TAGLINE = 'DODGE THE TREES. OUTRUN THE YETI.';

export type TitleLayout = {
  /** Screen y where the wordmark's top edge goes (below the status bar / web tab bar). */
  top: number;
  /** Screen y of the best score's baseline (just above the Start button). */
  bestY: number;
  best: number;
};

const r = (x: number, y: number, w: number, h: number) => Skia.XYWHRect(x, y, w, h);

/** A vertical navy wash from y0 to y1, through the given opacities (evenly spaced). */
function wash(c: SkCanvas, w: number, y0: number, y1: number, alphas: number[]) {
  const paint = Skia.Paint();
  const colors = alphas.map((a) => Skia.Color(`rgba(8, 16, 34, ${a})`));
  paint.setShader(Skia.Shader.MakeLinearGradient({ x: 0, y: y0 }, { x: 0, y: y1 }, colors, null, TileMode.Clamp));
  c.drawRect(r(0, Math.min(y0, y1), w, Math.abs(y1 - y0)), paint);
}

/** Pixel text with a 1px navy outline, centred on x with its bottom at y. */
function outlined(c: SkCanvas, text: string, color: string, x: number, y: number, scale: number) {
  const face = pixelText(text, color);
  const edge = pixelText(text, NAVY);
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) stamp(c, edge, x + dx, y + dy, scale);
  stamp(c, face, x, y, scale);
}

/** A big word with a hard pixel drop shadow, its top edge at `top`. */
function bigWord(c: SkCanvas, face: Art, shadow: Art, x: number, top: number, scale: number) {
  const bottom = top + face.h * scale - scale; // stamp() takes the bottom row
  const d = Math.max(2, Math.round(scale * 0.45));
  stamp(c, shadow, x + d, bottom + d, scale);
  stamp(c, face, x, bottom, scale);
}

export function renderTitle(
  snap: YetiRunSnapshot,
  w: number,
  h: number,
  extras: FrameExtras,
  { top, bestY, best }: TitleLayout,
): SkPicture {
  const game = renderFrame(snap, w, h, { ...extras, screenY: TITLE_SKIER_Y });
  return createPicture((c) => {
    c.drawPicture(game);

    // Night falling over the top of the hill, so the wordmark reads, and a
    // little at the foot for the button.
    wash(c, w, 0, h * 0.56, [0.94, 0.62, 0.22, 0]);
    wash(c, w, h, h * 0.78, [0.3, 0]);

    // The wordmark: as big as the narrower of the screen and a phone allows.
    const scale = Math.max(6, Math.min(22, Math.floor((Math.min(w, 520) - 64) / WORD_1.w)));
    const cx = Math.round(w / 2);
    bigWord(c, WORD_1, WORD_1_SHADOW, cx, top, scale);
    const runTop = top + WORD_1.h * scale + Math.round(scale * 1.2);
    bigWord(c, WORD_2, WORD_2_SHADOW, cx, runTop, scale);

    const tagScale = w < 360 ? 1 : 2;
    const tagY = runTop + WORD_2.h * scale + 22 + 5 * tagScale;
    outlined(c, TAGLINE, FROST, cx, tagY, tagScale);

    if (best > 0) outlined(c, `BEST ${best}`, GATE_GOLD, cx, bestY, 3);
  }, r(0, 0, w, h));
}
