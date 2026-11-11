import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { NAVY_2 } from '@/game/art';
import { ensureSkia } from '@/game/skia-ready';

// The run route. The screen itself (components/run-screen) is imported only
// after ensureSkia() — instant on iOS/Android, a WebAssembly download on web,
// where nothing that touches Skia may load before CanvasKit has.
//
// The load starts in an effect, not during render: app.json's web output is
// "server", so routes are also rendered in Node, where effects never run.
export default function RunRoute() {
  const [Screen, setScreen] = useState<ComponentType | null>(null);

  useEffect(() => {
    let live = true;
    ensureSkia()
      .then(() => import('@/components/run-screen'))
      .then((m) => live && setScreen(() => m.default));
    return () => {
      live = false;
    };
  }, []);

  if (Screen) return <Screen />;
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#a8c8f0" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: NAVY_2 },
});
