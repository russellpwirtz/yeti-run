// Web: the browser's localStorage. Guarded because routes also render in Node
// (app.json web output is "server"), where there is no localStorage, and
// private windows can throw on access.

export function load(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Storage full or blocked: the setting just won't stick.
  }
}
