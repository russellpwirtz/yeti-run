import { FieldGroup, Host, Switch, Text } from '@expo/ui';
import Constants from 'expo-constants';

import { useSettings } from '@/state/settings';

// Settings tab. FieldGroup is a SwiftUI Form on iOS and a grouped Material list
// on Android: the platform's native settings look, for free.
export default function SettingsScreen() {
  const { haptics, sound, setHaptics, setSound } = useSettings();

  return (
    <Host style={{ flex: 1 }} useViewportSizeMeasurement>
      <FieldGroup>
        <FieldGroup.Section title="Feedback">
          <Switch label="Haptics" value={haptics} onValueChange={setHaptics} />
          <Switch label="Sound" value={sound} onValueChange={setSound} />
        </FieldGroup.Section>
        <FieldGroup.Section title="About">
          <Text>{`Version ${Constants.expoConfig?.version ?? '?'}`}</Text>
        </FieldGroup.Section>
      </FieldGroup>
    </Host>
  );
}
