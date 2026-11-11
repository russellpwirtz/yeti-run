import { Button, Column, Host, Row, Spacer, Text } from '@expo/ui';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FROST, GATE_RED, NAVY_2, RULE } from '@/game/art';
import { useRunLoop, type Hud } from '@/game/use-run-loop';
import { useSettings } from '@/state/settings';

// The run screen (route: src/app/run.tsx). The hill is a Skia canvas fed a new
// picture every frame by useRunLoop; the HUD and the end-of-run panel are
// @expo/ui native views laid over it.
export default function RunScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { haptics, sound, best, recordScore } = useSettings();
  const [newBest, setNewBest] = useState(false);
  const { picture, gesture, hud, over, restart } = useRunLoop(width, height, {
    haptics,
    sound,
    onOver: (score) => {
      setNewBest(score > best);
      recordScore(score);
    },
  });

  return (
    <View style={styles.fill}>
      <StatusBar hidden />
      <GestureDetector gesture={gesture}>
        <Canvas style={styles.fill}>
          <Picture picture={picture} />
        </Canvas>
      </GestureDetector>

      <View style={[styles.panel, styles.top, { top: insets.top + 12 }]}>
        <Host
          matchContents={{ vertical: true }}
          style={styles.host}
          colorScheme="dark"
          seedColor={FROST}
        >
          <Row alignment="center" spacing={12}>
            <Text textStyle={{ color: FROST, fontSize: 17, fontWeight: '700' }}>
              {`${Math.floor(hud.distM)} m`}
            </Text>
            <Text textStyle={{ color: FROST, fontSize: 17 }}>{`score ${hud.score}`}</Text>
            <Spacer flexible />
            <YetiWarning hud={hud} />
            {!over && <Button label="Quit" variant="text" onPress={() => router.back()} />}
          </Row>
        </Host>
      </View>

      {!over && !hud.pushedOff && (
        <View pointerEvents="none" style={[styles.panel, { bottom: insets.bottom + 16 }]}>
          <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark">
            <Column spacing={6}>
              {HOW_TO_PLAY.map((line) => (
                <Text key={line} textStyle={{ color: FROST, fontSize: 14 }}>
                  {line}
                </Text>
              ))}
            </Column>
          </Host>
        </View>
      )}

      {over && (
        <View style={[styles.panel, { bottom: insets.bottom + 16 }]}>
          <Host
            matchContents={{ vertical: true }}
            style={styles.host}
            colorScheme="dark"
            seedColor={FROST}
          >
            <Column spacing={10}>
              <Text textStyle={{ color: FROST, fontSize: 22, fontWeight: '800' }}>
                {newBest ? 'New best!' : 'The yeti got you'}
              </Text>
              <Text textStyle={{ color: FROST, fontSize: 15 }}>
                {`${Math.floor(hud.distM)} m · ${hud.gatesPassed} gates · score ${hud.score}`}
              </Text>
              {!newBest && best > 0 && (
                <Text textStyle={{ color: FROST, fontSize: 13 }}>{`Best ${best}`}</Text>
              )}
              {Platform.OS === 'web' && (
                <Text textStyle={{ color: FROST, fontSize: 13 }}>Press Enter to ski again</Text>
              )}
              <Row spacing={8}>
                <Button label="Ski again" onPress={restart} />
                <Spacer flexible />
                <Button label="Close" variant="outlined" onPress={() => router.back()} />
              </Row>
            </Column>
          </Host>
        </View>
      )}
    </View>
  );
}

const HOW_TO_PLAY = [
  'Hold where you want to go, and drag to steer',
  'Tap to hop rocks · drag far straight down to tuck',
  'Off a ramp, swipe ← → ↑ ↓ for tricks',
  // Keyboard controls are wired up on web only (game/keyboard-listener.web.ts).
  ...(Platform.OS === 'web'
    ? ['Keys: ← → turn · hold ↓ to tuck · space hops · arrows do tricks in the air']
    : []),
];

function YetiWarning({ hud }: { hud: Hud }) {
  if (hud.yeti === 'howl') {
    return <Text textStyle={{ color: GATE_RED, fontSize: 15, fontWeight: '700' }}>A howl…</Text>;
  }
  if (hud.yeti === 'chase') {
    return (
      <Text textStyle={{ color: GATE_RED, fontSize: 15, fontWeight: '700' }}>
        {`Yeti ${Math.ceil(hud.yetiGapM)} m`}
      </Text>
    );
  }
  return null;
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
  top: { paddingVertical: 6 },
  // @expo/ui's web Host content-sizes horizontally whenever matchContents is
  // set, even vertical-only; stretch it so Spacer can push buttons to the edge.
  host: { alignSelf: 'stretch' },
});
