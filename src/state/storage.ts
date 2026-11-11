// Native: a small synchronous key-value store, backed by SQLite.
// Web uses storage.web.ts instead (expo-sqlite on web needs WebAssembly and
// cross-origin isolation headers — too much for two numbers and two switches).
import Storage from 'expo-sqlite/kv-store';

export function load(key: string): string | null {
  try {
    return Storage.getItemSync(key);
  } catch {
    return null;
  }
}

export function save(key: string, value: string): void {
  try {
    Storage.setItemSync(key, value);
  } catch {
    // Losing a saved setting isn't worth crashing the game over.
  }
}
