import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { NAVY_2 } from '@/game/art';
import { ensureSkia } from '@/game/skia-ready';

// Play tab. The title screen draws with Skia, so — like the run route — it's
// imported only after ensureSkia(): instant on iOS/Android, the CanvasKit
// download on web (which then makes starting a run instant too).
export default function PlayTab() {
  const [Screen, setScreen] = useState<ComponentType | null>(null);

  useEffect(() => {
    let live = true;
    ensureSkia()
      .then(() => import('@/components/title-screen'))
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
