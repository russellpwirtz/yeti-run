# Yeti Run

A top-down downhill skiing game in the spirit of SkiFree. Steer through pines,
rocks and slalom gates, hit ramps for tricks, and outrun the yeti. Built with
Expo, so it runs on iOS, Android and the web from one codebase.

**Play it in your browser: https://yeti-run.expo.app**

## Controls

| | Touch | Keyboard (web) |
|---|---|---|
| Steer | Hold where you want to go, drag to adjust | ← → (or A / D) |
| Tuck (faster, no turning) | Drag far straight down | Hold ↓ (or S) |
| Hop rocks and stumps | Quick tap | Space (or ↑ / W) |
| Tricks in ramp air | Swipe ← → ↑ ↓ | Arrow keys (or WASD) |
| Ski again | Tap **Ski again** | Enter |

## Running it

```bash
npm install     # also copies Skia's canvaskit.wasm into public/ for the web build
npm start       # Expo dev server: press w for web, or scan the QR code with Expo Go
```

The project is pinned to Expo SDK 57, the version Expo Go on physical devices
supports at the moment.

| Command | Does |
|---|---|
| `npm run check` | Typecheck, lint, the rule checks, and bundle exports for iOS, Android and web |
| `npm test` | The rule checks only: plain `tsx` scripts that assert against the real game code |
| `npm run preview -- out.png 4242` | Render real game frames headlessly to a PNG contact sheet (output file, seed) |
| `npm run playtest` | Play the web build in headless Chromium and save screenshots |
| `npm run sounds` | Regenerate the synthesized sound effects in `assets/sounds/` |

## How it's built

- **A pure, deterministic sim** (`src/game/sim.ts`). It uses a seeded RNG, fixed time steps and plain JSON state, with no React or platform code. That lets the tests, the headless preview and the title screen's attract-mode bot all drive the exact code the app runs.
- **Skia rendering** (`src/game/render.ts`). Each frame is recorded into one `SkPicture`. The pixel art is defined as data in `art.ts`.
- **A 60 fps loop that skips React.** The sim and renderer run on the JS thread each animation frame and hand the picture to the UI thread through a Reanimated shared value. React re-renders only for the HUD and screen changes.
- **Input** comes from a gesture-handler Pan gesture for touch, and keyboard listeners on web.
- **Feedback**: sound through expo-audio, haptics through expo-haptics. Settings and your best score are saved with expo-sqlite's kv-store on native and localStorage on web.
- **Navigation and UI**: Expo Router with native tabs, and `@expo/ui` components for the screens.

[CLAUDE.md](CLAUDE.md) has the full architecture notes, including the platform
splits and the gotchas around loading Skia on web.

## History

I built Yeti Run to learn the Expo ecosystem. The git history follows the
build milestone by milestone: scaffold, sim and tests, Skia canvas, game loop,
touch and keyboard controls, polish, web hosting and the title screen. It was built with
[Claude Code](https://claude.com/claude-code). The `CLAUDE.md` file and the
project skills in `.claude/skills/` are part of that workflow.

## License

[MIT](LICENSE)
