# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Yeti Run is a top-down downhill skiing game (SkiFree-style: steer through pines, rocks and slalom gates, jump ramps, outrun the yeti). It's an Expo app built with Expo Router, Skia, Reanimated and gesture-handler, and it runs on iOS, Android and web.

**Read `AGENTS.md` first.** It covers Expo rules: don't trust remembered Expo APIs and fetch the versioned docs instead, use `npx expo install` to add packages, and never hand-edit `ios/` or `android/`. The project is pinned to **Expo SDK 57**, because Expo Go on physical devices doesn't support 58 yet. Re-check that before upgrading.

## Commands

```bash
npm start                 # expo start (add --clear if Metro serves a stale lazy-loaded chunk)
npm run web               # dev server, web
npm run check             # typecheck + lint + tests + export bundles for ios/android/web. Run before calling work done.
npm run typecheck         # tsc for the app and for scripts/preview (separate tsconfig)
npm run lint              # expo lint
npm test                  # runs all three rule-check scripts below
npx tsx scripts/sim-check.ts        # run a single check (also controls-check.ts, feedback-check.ts)
npm run preview -- out.png 4242     # render real game frames headlessly to a PNG contact sheet (args: outFile, seed)
npm run sounds            # regenerate the synthesized WAVs in assets/sounds/
```

The tests are not Jest. Each one is a plain `tsx` script that asserts against the real code and exits 1 on failure. `sim-check.ts` also prints the score distribution for each bot, which you need when retuning the difficulty. Use `npm run preview` to check art or camera changes without opening the app. Its output, `preview.png`, is gitignored.

`postinstall` copies `canvaskit.wasm` into `public/` (it's gitignored). Web Skia won't load without it, so run `npm install` on a fresh clone.

## Architecture

The game logic is layered, and the lower layers have no React or platform dependencies. That's what lets the check scripts and the headless preview drive the same code the app runs.

- **`src/game/sim.ts`**: the pure, deterministic sim. Randomness comes only from the seeded RNG (`rng.ts`), plus a pure hash of (seed, chunk) for terrain. Time advances only in fixed `STEP_S` steps. State is plain JSON, and inputs are set through the exported mutators (`setSteer`, `setAim`, `setTuck`, `pressAction`, `pressTrick`). World coordinates are px with +y downhill, and the world is unbounded sideways. Keep this contract intact. `sim-check.ts` asserts determinism.
- **`engine.ts` (`RunEngine`)**: owns one sim, turns real elapsed time into fixed steps (capped at `MAX_FRAME_S`), records ski tracks, and surfaces `GameEvent`s. The sim keeps no event list of its own, so `events.ts` diffs state before and after each step. `bots.ts` provides autopilots, used by the tests, the preview and the title screen's attract mode.
- **`render.ts`** (with `art.ts`, pixel art defined as data, and `pops.ts`): `renderFrame()` records a whole frame into an `SkPicture`. It's used both on-device and by the headless preview (`scripts/preview/skia-shim.ts`).
- **`use-run-loop.ts`**: the React bridge. Each rAF frame runs on the JS thread: input, engine advance, events turned into feedback/pops, `renderFrame`. The resulting picture goes into a Reanimated shared value that `<Picture>` reads on the UI thread, so the 60 fps path never goes through React. React re-renders only for the HUD (about every 100 ms) and for phase changes. We chose this over UI-thread worklets so `sim.ts` stays plain JS that the checks and preview can run. `use-attract-loop.ts` is the same idea for the title screen.
- **Input**: `touch.ts` (`TouchSteering`) is fed by a gesture-handler Pan gesture with `runOnJS(true)`. Keep the callbacks off the `Gesture.Pan()` chain so they aren't auto-converted to worklets. `keys.ts` (`KeyboardSteering`) is web only. `keyboard-listener.web.ts` attaches the listener, and the native version is a no-op.
- **Feedback**: `feedback.ts` maps events to expo-audio sounds and expo-haptics, gated by user settings.
- **State**: `src/state/settings.ts` holds settings and the best score, exposed through `useSyncExternalStore`. Storage is `storage.ts` (expo-sqlite kv-store) on native and `storage.web.ts` (localStorage) on web. kv-store on web would need wasm plus COOP/COEP headers, so web avoids it.

### Platform splits and Skia on web

Platform differences live in `.web.ts` files outside `src/app/`. Expo Router bundles every route file for every platform, so a `run.web.tsx` route would pull CanvasKit (which needs Node `fs`) into the native bundles.

On web, Skia is CanvasKit, about 8 MB of wasm. Nothing that imports Skia may load before `ensureSkia()` (`skia-ready.web.ts`) resolves. That's why `src/app/run.tsx` lazy-imports `components/run-screen` from an effect, and the title screen does the same. `app.json` sets `web.output: "server"`, so routes are also rendered in Node, where effects never run. Keep Skia imports out of route modules.

### Routes

The routes are `src/app/(tabs)/` (Play/title, Settings) and `src/app/run.tsx` (a run). The screens themselves are in `src/components/`. `example/` is the original create-expo-app template, moved aside and excluded from tsconfig. Ignore it.

## Config notes

- The expo-audio plugin is configured as play-only in `app.json`. Don't let `RECORD_AUDIO` or microphone permissions creep back in, for example through `eas` commands writing plugin defaults.
- The React Compiler and typed routes are enabled (`app.json` `experiments`). The path alias is `@/*` → `src/*`.
