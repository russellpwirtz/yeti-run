import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SettingsProvider } from '@/state/settings';

// Root layout: a native stack. The tabs are its base screen; the game ("run")
// is presented over them full screen, so the tab bar is out of the way while
// you ski and dismissing the run drops you back where you were.
// GestureHandlerRootView must wrap the app for gesture-handler gestures to work.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SettingsProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="run"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
              gestureEnabled: false,
            }}
          />
        </Stack>
      </SettingsProvider>
    </GestureHandlerRootView>
  );
}
