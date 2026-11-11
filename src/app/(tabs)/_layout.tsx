import { NativeTabs } from 'expo-router/unstable-native-tabs';

// The (tabs) group: NativeTabs renders the platform's real tab bar
// (UITabBarController on iOS, Material bottom navigation on Android), and each
// file beside this one becomes a tab named after its route. The parentheses
// keep "(tabs)" out of the URL, so these screens are still "/" and "/settings".
export default function TabsLayout() {
  return (
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
  );
}
