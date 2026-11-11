// Web: forwards the window's key events to the game. Metro picks this file
// over keyboard-listener.ts on web, so the native bundles never see `window`.

export type KeyListener = {
  /** Return true if the key was used, so the browser doesn't scroll on it. */
  down(key: string, repeat: boolean): boolean;
  up(key: string): void;
  /** The window lost focus: keyups for keys held now will never arrive. */
  blur(): void;
};

export function listenToKeys(l: KeyListener): () => void {
  const onDown = (e: KeyboardEvent) => {
    // Leave browser shortcuts (Cmd+R, Ctrl+W, …) alone.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (l.down(e.key, e.repeat)) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => l.up(e.key);
  const onBlur = () => l.blur();
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);
  return () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
  };
}
