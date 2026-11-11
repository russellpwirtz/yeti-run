import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { SettingsProvider } from '@/state/settings';

// Root layout: wraps every screen. NativeTabs renders the platform's real tab bar
// (UITabBarController on iOS, Material bottom navigation on Android), so each
// file in src/app becomes a tab named after its route.
export default function RootLayout() {
  return (
    <SettingsProvider>
      <NativeTabs>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>Play</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="figure.skiing.downhill" md="downhill_skiing" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </SettingsProvider>
  );
}
