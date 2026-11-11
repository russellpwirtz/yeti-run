import { Canvas, Picture } from '@shopify/react-native-skia';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FROST, NAVY, NAVY_2, SNOW_HI } from '@/game/art';
import { listenToKeys } from '@/game/keyboard-listener';
import { useAttractLoop } from '@/game/use-attract-loop';
import { useSettings } from '@/state/settings';

// The Play tab (route: src/app/(tabs)/index.tsx). An autopilot run skis behind
// the pixel wordmark (game/title.ts), arcade attract-mode style. The Start
// button is a chunky frost key in the game's style, laid over the canvas.

const WEB = Platform.OS === 'web';
// On web the tab bar floats over the top of the screen; on iOS and Android it
// sits at the bottom, over or beside the content.
const TOP_CLEAR = WEB ? 104 : 36;
const BOTTOM_CLEAR = WEB ? 40 : 96;
const BUTTON_H = 56;

const startRun = () => router.push('/run');

export default function TitleScreen() {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {size.width > 0 && <Title width={size.width} height={size.height} top={insets.top} bottom={insets.bottom} />}
    </View>
  );
}

function Title({ width, height, top, bottom }: { width: number; height: number; top: number; bottom: number }) {
  const { best } = useSettings();
  const buttonBottom = bottom + BOTTOM_CLEAR;
  const picture = useAttractLoop(width, height, {
    top: top + TOP_CLEAR,
    bestY: height - buttonBottom - BUTTON_H - 20,
    best,
  });

  // Web: Enter or Space starts a run too.
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return;
    return listenToKeys({
      down: (key, repeat) => {
        if ((key !== 'Enter' && key !== ' ') || repeat) return false;
        startRun();
        return true;
      },
      up: () => {},
      blur: () => {},
    });
  }, [focused]);

  return (
    <>
      <Canvas style={styles.fill}>
        <Picture picture={picture} />
      </Canvas>
      <View style={[styles.startRow, { bottom: buttonBottom }]} pointerEvents="box-none">
        <StartButton />
      </View>
    </>
  );
}

function StartButton() {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={startRun}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.start,
        pressed && styles.startPressed,
        focused && styles.startFocused,
      ]}
    >
      <Text style={styles.startLabel}>Start run</Text>
    </Pressable>
  );
}

const KEY_EDGE = '#7fa6d8'; // the key's lower edge, a darker frost

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: NAVY_2 },
  startRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // A hard-edged key: frost face, darker bottom edge, navy outline. Pressing
  // pushes it down onto its edge.
  start: {
    height: BUTTON_H,
    minWidth: 220,
    paddingHorizontal: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: FROST,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: NAVY,
    borderBottomWidth: 6,
    borderBottomColor: KEY_EDGE,
  },
  startPressed: {
    backgroundColor: SNOW_HI,
    borderBottomWidth: 2,
    transform: [{ translateY: 4 }],
  },
  startFocused: {
    outlineColor: SNOW_HI,
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: 4,
  },
  startLabel: { color: NAVY, fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
});
