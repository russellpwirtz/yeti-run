// The game loop: the bridge between the engine (plain JS) and the screen.
//
// Every display frame, on the JS thread:
//   1. let the touch controls see the time (a held press starts steering)
//   2. advance the engine by the real time since the last frame (fixed steps)
//   3. record the frame into an SkPicture (renderFrame)
//   4. hand it to the canvas through a Reanimated shared value
//
// Step 4 is what keeps this smooth: <Picture picture={sharedValue} /> is read
// by Skia on the UI thread whenever the value changes, so the 60 fps path never
// goes through React. React only re-renders for the HUD (~10× a second) and
// for phase changes.
//
// Touches arrive through a gesture-handler Pan gesture. With runOnJS(true) its
// callbacks run on the JS thread — the same thread as the engine — so they can
// call straight into TouchSteering with no thread hop.

import { createPicture, type SkPicture } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Gesture, type PanGesture } from 'react-native-gesture-handler';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

import { RunEngine } from './engine';
import { renderFrame, SKIER_H, SKIER_SCREEN_X, SKIER_SCREEN_Y, viewFor } from './render';
import type { YetiRunSnapshot } from './sim';
import { TouchSteering } from './touch';

const HUD_EVERY_MS = 100;

export type Hud = Pick<
  YetiRunSnapshot,
  'distM' | 'score' | 'yeti' | 'yetiGapM' | 'gatesPassed' | 'pushedOff'
>;
const hudOf = (s: YetiRunSnapshot): Hud => ({
  distM: s.distM,
  score: s.score,
  yeti: s.yeti,
  yetiGapM: s.yetiGapM,
  gatesPassed: s.gatesPassed,
  pushedOff: s.pushedOff,
});
const EMPTY_HUD: Hud = {
  distM: 0,
  score: 0,
  yeti: 'asleep',
  yetiGapM: Infinity,
  gatesPassed: 0,
  pushedOff: false,
};

const newSeed = () => (Math.random() * 2 ** 31) | 0;
const nowS = () => performance.now() / 1000;

export type RunLoop = {
  picture: SharedValue<SkPicture>;
  /** Attach to a <GestureDetector> wrapping the canvas. */
  gesture: PanGesture;
  hud: Hud;
  over: boolean;
  /** Start a fresh run on a new hill. */
  restart: () => void;
};

/**
 * The Pan gesture, built once per screen. It forwards to whichever run's
 * controls are bound right now (each new run binds its own) — a closure
 * variable rather than a ref, so render never touches it.
 * One finger, from first contact (minDistance 0) so taps register.
 *
 * The callbacks are attached to `pan`, not chained onto Gesture.Pan(), on
 * purpose. The worklets Babel plugin auto-converts callbacks of a chain that
 * literally starts with `Gesture.X()` into worklets, and a worklet captures
 * its closure by value when it's created — it would see `target` as null
 * forever. Off the chain they stay plain JS functions, which runOnJS(true)
 * calls on the JS thread, where the engine lives.
 */
function makeTouchGesture() {
  let target: TouchSteering | null = null;
  const onBegin = (e: { x: number; y: number }) => target?.down(e.x, e.y, nowS());
  const onUpdate = (e: { x: number; y: number }) => target?.move(e.x, e.y);
  const onFinalize = (_e: unknown, completed: boolean) => target?.up(completed);
  const pan = Gesture.Pan().runOnJS(true).minDistance(0).maxPointers(1);
  const gesture = pan.onBegin(onBegin).onUpdate(onUpdate).onFinalize(onFinalize);
  return {
    gesture,
    bind: (controls: TouchSteering | null) => {
      target?.up(false);
      target = controls;
    },
  };
}

export function useRunLoop(width: number, height: number): RunLoop {
  const [blank] = useState(() => createPicture(() => {}));
  const picture = useSharedValue<SkPicture>(blank);
  const [seed, setSeed] = useState(newSeed);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD);
  const [overSeed, setOverSeed] = useState<number | null>(null);
  const [touch] = useState(makeTouchGesture);

  // The field size is read every frame but must not restart the run.
  const size = useRef({ width, height });
  useEffect(() => {
    size.current = { width, height };
  }, [width, height]);

  useEffect(() => {
    const engine = new RunEngine(seed);
    // Aim from the skier's middle (the renderer pins their feet at
    // SKIER_SCREEN_X/Y of the field), in the gesture's coordinates.
    const controls = new TouchSteering(engine, () => ({
      x: size.current.width * SKIER_SCREEN_X,
      y: size.current.height * SKIER_SCREEN_Y - SKIER_H / 3,
    }));
    touch.bind(controls);

    let raf = 0;
    let last = nowS();
    let lastHud = -Infinity;
    let active = AppState.currentState !== 'background';

    const tick = () => {
      const now = nowS();
      controls.tick(now);
      const alive = engine.advance(now - last);
      last = now;

      const { width: w, height: h } = size.current;
      const snap = engine.snapshot(viewFor(w, h));
      picture.set(renderFrame(snap, w, h, engine.tracks));

      if ((now - lastHud) * 1000 >= HUD_EVERY_MS || !alive) {
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
    // the time away isn't simulated. A finger held as the app left is let go.
    const sub = AppState.addEventListener('change', (state) => {
      const nowActive = state !== 'background';
      if (nowActive === active || engine.over) return;
      active = nowActive;
      cancelAnimationFrame(raf);
      if (active) {
        last = nowS();
        raf = requestAnimationFrame(tick);
      } else {
        controls.up(false);
      }
    });

    if (active) raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      sub.remove();
      touch.bind(null);
    };
  }, [seed, picture, touch]);

  return {
    picture,
    gesture: touch.gesture,
    hud,
    over: overSeed === seed,
    restart: () => {
      setHud(EMPTY_HUD);
      setSeed(newSeed());
    },
  };
}
