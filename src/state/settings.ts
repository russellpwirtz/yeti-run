import { useSyncExternalStore } from 'react';

import { load, save } from './storage';

// App-wide player settings and the best score, saved on the device
// (storage.ts on iOS/Android, storage.web.ts in the browser).
//
// A tiny external store read with useSyncExternalStore, so every screen sees a
// change at once. Its server snapshot is the defaults: on web, routes are also
// rendered in Node, where nothing is saved, and the browser's first render has
// to match that before it switches to the saved values.

type Saved = { haptics: boolean; sound: boolean; best: number };

const DEFAULTS: Saved = { haptics: true, sound: true, best: 0 };
const KEYS = { haptics: 'settings.haptics', sound: 'settings.sound', best: 'best' } as const;

const loadFlag = (key: string, fallback: boolean) => {
  const v = load(key);
  return v === null ? fallback : v === '1';
};

let current: Saved | null = null; // read from storage on first use
const listeners = new Set<() => void>();

function getSnapshot(): Saved {
  return (current ??= {
    haptics: loadFlag(KEYS.haptics, DEFAULTS.haptics),
    sound: loadFlag(KEYS.sound, DEFAULTS.sound),
    best: Number(load(KEYS.best)) || 0,
  });
}

const getServerSnapshot = () => DEFAULTS;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(patch: Partial<Saved>) {
  current = { ...getSnapshot(), ...patch };
  listeners.forEach((l) => l());
}

export function setHaptics(v: boolean) {
  update({ haptics: v });
  save(KEYS.haptics, v ? '1' : '0');
}

export function setSound(v: boolean) {
  update({ sound: v });
  save(KEYS.sound, v ? '1' : '0');
}

/** Save a finished run's score if it beats the best. */
export function recordScore(score: number) {
  if (score <= getSnapshot().best) return;
  update({ best: score });
  save(KEYS.best, String(score));
}

export function useSettings() {
  const saved = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...saved, setHaptics, setSound, recordScore };
}
