import { Button, Column, Host, Spacer, Text } from '@expo/ui';
import { router } from 'expo-router';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/state/settings';

// Play tab. Everything here is @expo/ui "universal" components: on iOS they
// render as SwiftUI views, on Android as Jetpack Compose. `Host` is the bridge
// between React Native's view tree and the native UI toolkit.
export default function PlayScreen() {
  const dark = useColorScheme() === 'dark';
  const { haptics, sound } = useSettings();
  const fg = dark ? '#FFFFFF' : '#0B1A2B';
  const muted = dark ? '#9FB3C8' : '#52677D';

  return (
    <Host style={{ flex: 1 }} seedColor="#2E86DE">
      <Column alignment="center" spacing={16}>
        <Spacer flexible />
        <Text textStyle={{ fontSize: 44, fontWeight: '900', color: fg, letterSpacing: 2 }}>
          YETI RUN
        </Text>
        <Text textStyle={{ fontSize: 17, color: muted }}>Outrun the yeti. Dodge the trees.</Text>
        <Spacer size={24} />
        <Text textStyle={{ fontSize: 15, color: muted }}>Best score: —</Text>
        <Button label="Start run" onPress={() => router.push('/run')} />
        <Text textStyle={{ fontSize: 13, color: muted }}>
          {`Haptics ${on(haptics)} · sound ${on(sound)}`}
        </Text>
        <Spacer flexible />
      </Column>
    </Host>
  );
}

const on = (v: boolean) => (v ? 'on' : 'off');
