import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// Web: Skia is CanvasKit, an ~8 MB WebAssembly file served from /public
// (`npm install` copies it there — see the postinstall script). Skia's web
// module reads the loaded CanvasKit the moment it's first imported, so call
// this before importing anything that uses Skia.
//
// This lives outside src/app on purpose: Expo Router bundles every route file
// for every platform, so a run.web.tsx route would drag CanvasKit (which needs
// Node's fs) into the iOS and Android bundles. Plain imports like this one do
// get Metro's per-platform .web.ts resolution.
//
// Called by both the Play tab and the run screen; the load happens once.
let loading: Promise<void> | null = null;
export function ensureSkia(): Promise<void> {
  loading ??= LoadSkiaWeb({ locateFile: (file) => `/${file}` }).catch((e) => {
    loading = null; // let a later call retry (e.g. after a network blip)
    throw e;
  });
  return loading;
}
