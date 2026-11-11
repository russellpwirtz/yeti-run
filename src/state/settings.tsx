import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// App-wide player settings. In-memory for now; milestone 6 persists them.
type Settings = {
  haptics: boolean;
  sound: boolean;
  setHaptics: (v: boolean) => void;
  setSound: (v: boolean) => void;
};

const SettingsContext = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [haptics, setHaptics] = useState(true);
  const [sound, setSound] = useState(true);
  const value = useMemo(() => ({ haptics, sound, setHaptics, setSound }), [haptics, sound]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
