---
name: playtest-web
description: Play Yeti Run's real web build in headless Chromium (title/attract mode, a keyboard run to the yeti catch and restart, touch steering and hop) and look at the screenshots. Use to confirm a gameplay, input, UI or rendering change works in the running app, to reproduce a web-only bug, or to smoke-test a deployed URL. For art or camera changes alone, the cheaper `npm run preview` contact sheet usually suffices.
---

# Playtest the web build

`npm run playtest` (`scripts/playtest.ts`) drives the app the way a player
would and saves screenshots. Use it rather than writing a fresh Playwright or
CDP script: it already knows the routes, where the skier is on screen, the
headless WebGL flags Skia needs, and how to send touches the Pan gesture accepts.

## Run it

```bash
npm run playtest -- --out <scratchpad>/playtest                 # all scenarios, local dev server
npm run playtest -- keys --out <scratchpad>/playtest            # one scenario: title | keys | touch
npm run playtest -- --clear --out <scratchpad>/playtest         # fresh Metro (stale-chunk suspicion)
npm run playtest -- --url https://yeti-run.expo.app --out <scratchpad>/playtest   # deployed site
```

- Pass `--out` pointing into the session scratchpad. The default, `playtest-out/` in the repo, is gitignored and fine for a user running it themselves.
- It reuses a dev server already answering on `--port` (default 8099), or starts `CI=1 npx expo start --web` and stops it afterwards. The first page load bundles and fetches ~8 MB of CanvasKit, so the first scenario can take a minute. Run with a Bash timeout of at least 5 minutes.
- Exit 1 means a page error, a console error, or a failed scenario check; the failures are listed at the end.

## What each scenario checks

| Scenario | Does | Fails if |
|---|---|---|
| `title` | Loads `/`, two shots of attract mode, presses Enter | Enter doesn't navigate to `/run` |
| `keys` | Weaves with arrows/space until the yeti ends the run, then Enter | The run never ends in 90 s, or Enter doesn't restart |
| `touch` | CDP touch holds down-right, down-left, then a tap | The how-to-play hint stays up (touches never pushed off) |

## Then look at the screenshots

Passing only proves nothing threw and the flow advanced. **Read the PNGs** before
reporting that something works: check the skier, tracks, HUD, pops and panels
look right for the change you made. Show the user the relevant shot paths.

## When it misbehaves

- **Your change doesn't show up**: Metro served a stale lazy-loaded chunk (this has bitten the title screen). Stop any server on the port and rerun with `--clear`.
- **Blank canvas / Skia errors**: `public/canvaskit.wasm` is missing. Run `npm install` (postinstall copies it).
- **wasm fetch errors** right after a reload are usually the test navigating mid-download, not an app bug. Confirm by rerunning before chasing them.
- **Browser not installed**: `npx playwright install chromium-headless-shell`.
- **New scenario needed** (settings screen, a new control): add a function to `scripts/playtest.ts` alongside `title`/`keys`/`touch` rather than a throwaway script, so the next session gets it too. If `SKIER_SCREEN_X/Y` in `src/game/render.ts` changes, update `SKIER_X/Y` in the script.

This covers web only. Native rendering, haptics and sound still need Expo Go on a device (or the Expo `eas-simulator` skill).
