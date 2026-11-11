// The title screen's attract mode: the steering bot skis a real run behind the
// title until the yeti gets it, the yeti eats it, and a new run starts on a
// fresh hill. Same engine, renderer and pop-ups as a played run; no sound or
// haptics.
//
// It only runs while the Play tab is on screen — not behind the run, not on
// the Settings tab. With Reduce Motion on it draws one still frame instead.

import { createPicture, type SkPicture } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { makeSteerBot } from './bots';
import { RunEngine } from './engine';
import { PopFeed } from './pops';
import { CATCH_BEAT_MS, viewFor } from './render';
import { renderTitle, TITLE_SKIER_Y, type TitleLayout } from './title';

const NEXT_RUN_MS = CATCH_BEAT_MS + 700; // after the catch, a beat, then a new hill
const STILL_AT_S = 9; // reduced motion: the frame shown, this far into a run

const newSeed = () => (Math.random() * 2 ** 31) | 0;
const nowS = () => performance.now() / 1000;
const newRun = () => new RunEngine(newSeed(), makeSteerBot(false));

export function useAttractLoop(width: number, height: number, layout: TitleLayout): SharedValue<SkPicture> {
  const [blank] = useState(() => createPicture(() => {}));
  const picture = useSharedValue<SkPicture>(blank);
  const focused = useIsFocused();
  const reduceMotion = useReducedMotion();

  // Size and layout are read every frame but mustn't restart the loop.
  const view = useRef({ width, height, layout });
  useEffect(() => {
    view.current = { width, height, layout };
  });

  useEffect(() => {
    const draw = (engine: RunEngine, pops: PopFeed, now: number, eatMs: number | null, snow: boolean) => {
      const { width: w, height: h, layout: l } = view.current;
      const snap = engine.snapshot(viewFor(w, h, TITLE_SKIER_Y));
      const extras = { tracks: engine.tracks, pops: pops.live(now), eatMs, snowT: snow ? now : null };
      picture.set(renderTitle(snap, w, h, extras, l));
    };

    if (reduceMotion) {
      const engine = newRun();
      engine.advance(STILL_AT_S);
      draw(engine, new PopFeed(), 0, null, false);
      return;
    }
    if (!focused) return;

    let engine = newRun();
    let pops = new PopFeed();
    let caughtAt: number | null = null;
    let last = nowS();
    let raf = 0;

    const tick = () => {
      const now = nowS();
      engine.advance(now - last);
      last = now;
      pops.push(engine.takeEvents(), now);

      let eatMs: number | null = null;
      if (engine.over) {
        caughtAt ??= now;
        eatMs = (now - caughtAt) * 1000;
        if (eatMs >= NEXT_RUN_MS) {
          engine = newRun();
          pops = new PopFeed();
          caughtAt = null;
          eatMs = null;
        }
      }
      draw(engine, pops, now, eatMs, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [focused, reduceMotion, picture]);

  return picture;
}
