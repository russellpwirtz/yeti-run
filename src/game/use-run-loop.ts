// The game loop: the bridge between the engine (plain JS) and the screen.
//
// Every display frame, on the JS thread:
//   1. advance the engine by the real time since the last frame (fixed steps)
//   2. record the frame into an SkPicture (renderFrame)
//   3. hand it to the canvas through a Reanimated shared value
//
// Step 3 is what keeps this smooth: <Picture picture={sharedValue} /> is read
// by Skia on the UI thread whenever the value changes, so the 60 fps path never
// goes through React. React only re-renders for the HUD (~10× a second) and
// for phase changes.

import { createPicture, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { makeSteerBot } from './bots';
import { RunEngine } from './engine';
import { renderFrame, viewFor } from './render';
import type { YetiRunSnapshot } from './sim';

const HUD_EVERY_MS = 100;

export type Hud = Pick<YetiRunSnapshot, 'distM' | 'score' | 'yeti' | 'yetiGapM' | 'gatesPassed'>;
const hudOf = (s: YetiRunSnapshot): Hud => ({
  distM: s.distM,
  score: s.score,
  yeti: s.yeti,
  yetiGapM: s.yetiGapM,
  gatesPassed: s.gatesPassed,
});
const EMPTY_HUD: Hud = { distM: 0, score: 0, yeti: 'asleep', yetiGapM: Infinity, gatesPassed: 0 };

const newSeed = () => (Math.random() * 2 ** 31) | 0;
// Until touch controls (milestone 5), the steering bot skis every run.
const autopilot = makeSteerBot(false);

export type RunLoop = {
  picture: SharedValue<SkPicture>;
  hud: Hud;
  over: boolean;
  /** Start a fresh run on a new hill. */
  restart: () => void;
};

export function useRunLoop(width: number, height: number): RunLoop {
  const [blank] = useState(() => createPicture(() => {}));
  const picture = useSharedValue<SkPicture>(blank);
  const [seed, setSeed] = useState(newSeed);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [overSeed, setOverSeed] = useState<number | null>(null);

  // The field size is read every frame but must not restart the run.
  const size = useRef({ width, height });
  useEffect(() => {
    size.current = { width, height };
  }, [width, height]);

  useEffect(() => {
    const engine = new RunEngine(seed, autopilot);
    let raf = 0;
    let last = performance.now();
    let lastHud = -Infinity;
    let active = AppState.currentState !== 'background';

    const tick = () => {
      const now = performance.now();
      const alive = engine.advance((now - last) / 1000);
      last = now;

      const { width: w, height: h } = size.current;
      const snap = engine.snapshot(viewFor(w, h));
      picture.set(renderFrame(snap, w, h, engine.tracks));

      if (now - lastHud >= HUD_EVERY_MS || !alive) {
        lastHud = now;
        setHud(hudOf(snap));
      }
      if (!alive) {
        setOverSeed(seed);
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    // Pause while the app is in the background; resync the clock on return so
    // the time away isn't simulated.
    const sub = AppState.addEventListener('change', (state) => {
      const nowActive = state !== 'background';
      if (nowActive === active || engine.over) return;
      active = nowActive;
      cancelAnimationFrame(raf);
      if (active) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    });

    if (active) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      sub.remove();
    };
  }, [seed, picture]);

  return {
    picture,
    hud,
    over: overSeed === seed,
    restart: () => {
      setHud(EMPTY_HUD);
      setSeed(newSeed());
    },
  };
}
