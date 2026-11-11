// Native: no keyboard events. React Native has no built-in API for hardware
// keyboard keys, so iPad and Android keyboards aren't wired up (yet).
// See keyboard-listener.web.ts.
import type { KeyListener } from './keyboard-listener.web';

export type { KeyListener };

export function listenToKeys(_l: KeyListener): () => void {
  return () => {};
}
