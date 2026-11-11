// ============================================
// Deterministic PRNG — mulberry32 with explicit integer state
// ============================================
// Ported from rungotchu. Code under src/game/ may NOT touch Math.random(): the
// RNG state lives inside the sim state so a run replays identically from its
// seed. State is a plain 32-bit int — JSON-safe by construction. Every call
// returns the next state; callers must store it back. Seed minting
// (Math.random etc.) happens OUTSIDE the sim, in the hook/screen layer.

export function rngNext(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}

/** Uniform integer in [0, n). */
export function rngInt(state: number, n: number): { value: number; state: number } {
  const r = rngNext(state);
  return { value: Math.floor(r.value * n), state: r.state };
}
