---
name: deploy-web
description: Deploy Yeti Run's web build to EAS Hosting (production yeti-run.expo.app, or a preview URL) and verify it. Only when the user explicitly asks to deploy.
disable-model-invocation: true
argument-hint: "[preview]"
---

# Deploy the web build

Deploy to **production** unless the arguments say `preview`. For general EAS
Hosting questions (env vars, custom domains, workflows), see Expo's
`eas-hosting` skill; this one is the project's checklist.

## 1. Preconditions: stop and tell the user if any fails

- On `main` with a clean tree (`git status --short` empty). Every deployment must match a commit, so if there are changes, ask whether to commit them first. Don't commit unasked.
- `npx eas-cli@latest whoami` succeeds. If not, ask the user to run `! npx eas-cli@latest login`.
- `app.json` hasn't regained microphone permissions: no `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` under `android.permissions`, and the expo-audio plugin still has `microphonePermission: false`, `recordAudioAndroid: false`, `enableBackgroundPlayback: false`. EAS commands have written these back before.
- `public/canvaskit.wasm` exists. If not, run `npm install`.

## 2. Build

```bash
npm run check                       # typecheck, lint, tests, all-platform bundles
npx expo export --platform web      # re-export web only; check leaves ios/android in dist/
```

Stop on any failure.

## 3. Deploy

```bash
npx eas-cli@latest deploy --prod --non-interactive    # production
npx eas-cli@latest deploy --non-interactive           # preview: yeti-run--<id>.expo.app
```

The upload is ~11 MB, mostly `canvaskit.wasm`. If it's far smaller, the wasm is
missing. Note the deployment URL from the output.

## 4. Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" <deployed URL>/
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" <deployed URL>/canvaskit.wasm   # 200 application/wasm
npm run playtest -- --url <deployed URL> --out <scratchpad>/deploy-check
```

Read the playtest screenshots. The game must actually render on the deployed
site, not just return 200.

## 5. Report

Give the URL, the commit SHA deployed, and the playtest result. The dashboard
lives at https://expo.dev/projects/c626c882-4e8b-452e-b544-c849c969d756/hosting/deployments
(to roll back, promote an earlier deployment there).
