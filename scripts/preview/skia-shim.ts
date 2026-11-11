// Stands in for '@shopify/react-native-skia' when the game's render code runs
// in Node (see render-preview.ts). The real package's entry point pulls in
// React Native; this one drives the same Skia API through CanvasKit (Skia
// compiled to WebAssembly) via the package's own headless build. tsx swaps it
// in through the `paths` entry in ./tsconfig.json.
//
// It only provides what src/game/render.ts uses. Call initSkia() before
// rendering anything.

import { readFileSync } from 'node:fs';

import type * as Headless from '@shopify/react-native-skia/lib/typescript/src/headless';
import type {
  Skia as SkiaApi,
  SkFont,
  SkPicture,
  SkRect,
} from '@shopify/react-native-skia/lib/typescript/src/skia/types';

/* eslint-disable @typescript-eslint/no-require-imports -- deep CommonJS builds with no type entry */
const headless: typeof Headless = require('@shopify/react-native-skia/lib/commonjs/headless');
const CanvasKitInit: () => Promise<unknown> = require('canvaskit-wasm/bin/full/canvaskit');
/* eslint-enable @typescript-eslint/no-require-imports */

export type {
  SkCanvas,
  SkFont,
  SkPaint,
  SkPicture,
} from '@shopify/react-native-skia/lib/typescript/src/skia/types';
export const { PaintStyle } = headless;

export let Skia: SkiaApi;

export async function initSkia(): Promise<SkiaApi> {
  (globalThis as { CanvasKit?: unknown }).CanvasKit = await CanvasKitInit();
  Skia = headless.getSkiaExports().Skia;
  return Skia;
}

export function makeSurface(width: number, height: number) {
  return headless.makeOffscreenSurface(width, height);
}

export function createPicture(cb: (canvas: ReturnType<ReturnType<SkiaApi['PictureRecorder']>['beginRecording']>) => void, rect?: SkRect): SkPicture {
  const recorder = Skia.PictureRecorder();
  cb(recorder.beginRecording(rect));
  return recorder.finishRecordingAsPicture();
}

// No system font manager in CanvasKit, so load a macOS font file directly.
const FONT_FILE = '/System/Library/Fonts/Supplemental/Arial Bold.ttf';
// The weight is accepted for API compatibility; the file above is always bold.
export function matchFont(style: { fontSize?: number; fontWeight?: string } = {}): SkFont {
  const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(Skia.Data.fromBytes(readFileSync(FONT_FILE)));
  return Skia.Font(typeface ?? undefined, style.fontSize ?? 14);
}
