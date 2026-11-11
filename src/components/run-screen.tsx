import { Button, Column, Host, Row, Spacer, Text } from '@expo/ui';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FROST, GATE_RED, NAVY_2, RULE } from '@/game/art';
import { useRunLoop, type Hud } from '@/game/use-run-loop';

// The run screen (route: src/app/run.tsx). The hill is a Skia canvas fed a new
// picture every frame by useRunLoop; the HUD and the end-of-run panel are
// @expo/ui native views laid over it.
export default function RunScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { picture, hud, over, restart } = useRunLoop(width, height);

  return (
    <View style={styles.fill}>
      <StatusBar hidden />
      <Canvas style={styles.fill}>
        <Picture picture={picture} />
      </Canvas>

      <View style={[styles.panel, styles.top, { top: insets.top + 12 }]}>
        <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark" seedColor={FROST}>
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

      {over && (
        <View style={[styles.panel, { bottom: insets.bottom + 16 }]}>
          <Host matchContents={{ vertical: true }} style={styles.host} colorScheme="dark" seedColor={FROST}>
            <Column spacing={10}>
              <Text textStyle={{ color: FROST, fontSize: 22, fontWeight: '800' }}>
                The yeti got you
              </Text>
              <Text textStyle={{ color: FROST, fontSize: 15 }}>
                {`${Math.floor(hud.distM)} m · ${hud.gatesPassed} gates · score ${hud.score}`}
              </Text>
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
