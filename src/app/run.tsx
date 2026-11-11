import { Button, Column, Host, Row, Slider, Spacer, Text } from '@expo/ui';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FROST, NAVY_2, RULE } from '@/game/art';
import { DemoRun } from '@/game/demo-run';
import { renderFrame, viewFor } from '@/game/render';

const MAX_S = 75; // past the longest autopilot run, so the slider can reach the catch

const newSeed = () => (Math.random() * 2 ** 31) | 0;

// Milestone 3: the game drawn with Skia, driven by a scrub slider instead of a
// clock. Drag through the run and the camera follows the autopilot down the hill.
export default function RunScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [run, setRun] = useState(() => new DemoRun(newSeed()));
  const [seconds, setSeconds] = useState(0);

  const snap = useMemo(() => run.at(seconds, viewFor(width, height)), [run, seconds, width, height]);
  const picture = useMemo(() => renderFrame(snap, width, height), [snap, width, height]);

  return (
    <View style={styles.fill}>
      <StatusBar hidden />
      <Canvas style={styles.fill}>
        <Picture picture={picture} />
      </Canvas>

      <View style={[styles.panel, { bottom: insets.bottom + 16 }]}>
        <Host matchContents={{ vertical: true }} colorScheme="dark" seedColor={FROST}>
          <Column spacing={8}>
            <Text textStyle={{ color: FROST, fontSize: 15, fontWeight: '600' }}>
              {`${seconds.toFixed(1)} s · ${Math.floor(snap.distM)} m · score ${snap.score} · yeti ${snap.yeti}`}
            </Text>
            <Slider value={seconds} min={0} max={MAX_S} onValueChange={setSeconds} />
            <Row spacing={8}>
              <Button
                label="New hill"
                variant="outlined"
                onPress={() => {
                  setRun(new DemoRun(newSeed()));
                  setSeconds(0);
                }}
              />
              <Spacer flexible />
              <Button label="Close" onPress={() => router.back()} />
            </Row>
          </Column>
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: NAVY_2 + 'e6',
    borderWidth: 1,
    borderColor: RULE,
  },
});
