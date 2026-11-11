// Renders real game frames to a PNG contact sheet, off-device:
//
//   npm run preview -- [outFile] [seed]
//
// It runs the app's own renderFrame() (src/game/render.ts) on headless Skia,
// over an autopilot run, at a few moments from the start to the yeti's catch,
// then through the yeti eating the skier. Score pop-ups and snow included.
// Handy for checking art and camera changes without opening the app.

import { writeFileSync } from 'node:fs';

import { makeSteerBot } from '../../src/game/bots';
import { RunEngine } from '../../src/game/engine';
import { PopFeed } from '../../src/game/pops';
import { STEP_S } from '../../src/game/sim';
import { renderFrame, viewFor } from '../../src/game/render';
import { initSkia, makeSurface, matchFont } from './skia-shim';

const W = 390; // an iPhone-sized field, in points
const H = 844;
const out = process.argv[2] ?? 'preview.png';
const seed = Number(process.argv[3] ?? 4242);

async function main() {
  const Skia = await initSkia();
  // Play the run once to learn when it ends, then again to shoot the frames
  const probe = new RunEngine(seed, makeSteerBot(false));
  while (probe.advance(STEP_S));
  const end = probe.elapsed;
  // Sim time, and for the last few how far into the catch (ms)
  const moments: { t: number; eatMs?: number }[] = [
    ...[0, 2, 8, 20, 35, end - 1].map((t) => ({ t })),
    ...[200, 700, 1400, 2400].map((eatMs) => ({ t: end, eatMs })),
  ];

  const sheet = makeSurface(W * moments.length, H + 28);
  const c = sheet.getCanvas();
  c.drawColor(Skia.Color('#081022'));
  const label = Skia.Paint();
  label.setColor(Skia.Color('#a8c8f0'));
  const font = matchFont({ fontSize: 16 });

  const engine = new RunEngine(seed, makeSteerBot(false));
  const pops = new PopFeed();
  moments.forEach(({ t, eatMs }, i) => {
    while (engine.elapsed < t - STEP_S / 2 && engine.advance(STEP_S)) {
      pops.push(engine.takeEvents(), engine.elapsed);
    }
    const snap = engine.snapshot(viewFor(W, H));
    c.save();
    c.translate(i * W, 0);
    c.clipRect(Skia.XYWHRect(0, 0, W - 4, H), 1, false);
    c.drawPicture(
      renderFrame(snap, W, H, {
        tracks: engine.tracks,
        pops: pops.live(engine.elapsed),
        eatMs: eatMs ?? null,
        snowT: snap.t,
      }),
    );
    c.restore();
    const caption = `${t.toFixed(1)}s  ${Math.floor(snap.distM)}m  ${snap.yeti}${eatMs ? ` +${eatMs}ms` : ''}`;
    c.drawText(caption, i * W + 8, H + 20, label, font);
  });
  sheet.flush();
  writeFileSync(out, sheet.makeImageSnapshot().encodeToBytes());
  console.log(`seed ${seed}: run ends at ${end.toFixed(1)}s → ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
