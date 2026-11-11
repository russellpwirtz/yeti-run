/// <reference types="node" />
// ============================================
// Sound effects — run with: npm run sounds
// ============================================
// Synthesizes the game's chiptune-style sound effects into assets/sounds/*.wav
// (16-bit mono PCM). Generated, not recorded, so there are no licensing
// questions and they're easy to tweak: change a recipe, rerun, listen.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 22050;
const OUT = join(__dirname, "..", "assets", "sounds");

type Wave = "square" | "triangle" | "sine" | "noise";

/** A tone sweeping from f0 to f1 Hz over `dur` seconds, with a quick attack and an exponential decay. */
type Note = { wave: Wave; f0: number; f1?: number; dur: number; at?: number; vol?: number; decay?: number; vibrato?: number };

let noiseState = 12345;
function noise() {
  // xorshift — deterministic, so regenerating gives identical files
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
}

function render(notes: Note[]): Float32Array {
  const len = Math.max(...notes.map((n) => (n.at ?? 0) + n.dur));
  const buf = new Float32Array(Math.ceil(len * RATE));
  for (const n of notes) {
    const start = Math.floor((n.at ?? 0) * RATE);
    const count = Math.floor(n.dur * RATE);
    let phase = 0;
    let held = 0;
    for (let i = 0; i < count; i++) {
      const t = i / RATE;
      const p = i / count;
      let f = n.f0 * Math.pow((n.f1 ?? n.f0) / n.f0, p); // exponential sweep sounds even to the ear
      if (n.vibrato) f *= 1 + 0.03 * Math.sin(2 * Math.PI * n.vibrato * t);
      phase = (phase + f / RATE) % 1;
      let v: number;
      if (n.wave === "square") v = phase < 0.5 ? 1 : -1;
      else if (n.wave === "triangle") v = 1 - 4 * Math.abs(phase - 0.5);
      else if (n.wave === "sine") v = Math.sin(2 * Math.PI * phase);
      else {
        // noise, resampled at f Hz for a pitched crunch
        if (i % Math.max(1, Math.round(RATE / f)) === 0) held = noise();
        v = held;
      }
      const attack = Math.min(1, t / 0.005);
      const env = attack * Math.exp(-(n.decay ?? 3) * p);
      buf[start + i] += v * env * (n.vol ?? 0.5);
    }
  }
  return buf;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767 * 0.8), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

const SOUNDS: Record<string, Note[]> = {
  // A short upward blip
  hop: [{ wave: "square", f0: 330, f1: 660, dur: 0.09, vol: 0.25, decay: 2 }],
  // Off a ramp: a longer whoosh up
  ramp: [
    { wave: "triangle", f0: 220, f1: 880, dur: 0.28, vol: 0.45, decay: 1.5 },
    { wave: "noise", f0: 6000, dur: 0.25, vol: 0.12, decay: 2.5 },
  ],
  // Through a gate: a two-note chime
  gate: [
    { wave: "square", f0: 1319, dur: 0.07, vol: 0.18, decay: 1 },
    { wave: "square", f0: 1976, dur: 0.16, at: 0.07, vol: 0.18, decay: 3 },
  ],
  // Style points (air, a trick, a clean landing): a rising arpeggio
  style: [
    { wave: "triangle", f0: 784, dur: 0.06, vol: 0.45 },
    { wave: "triangle", f0: 988, dur: 0.06, at: 0.06, vol: 0.45 },
    { wave: "triangle", f0: 1175, dur: 0.06, at: 0.12, vol: 0.45 },
    { wave: "triangle", f0: 1568, dur: 0.16, at: 0.18, vol: 0.45, decay: 4 },
  ],
  // Into a tree or a bad landing: a crunch and a falling thud
  crash: [
    { wave: "noise", f0: 3000, f1: 800, dur: 0.3, vol: 0.5, decay: 5 },
    { wave: "square", f0: 160, f1: 50, dur: 0.25, vol: 0.35, decay: 4 },
  ],
  // The yeti wakes, somewhere up the hill: a long, wavering howl
  howl: [
    { wave: "triangle", f0: 180, f1: 420, dur: 0.5, vol: 0.55, decay: 0.2, vibrato: 6 },
    { wave: "triangle", f0: 420, f1: 260, dur: 0.9, at: 0.5, vol: 0.55, decay: 2.2, vibrato: 7 },
    { wave: "noise", f0: 1200, dur: 1.2, vol: 0.06, decay: 1.5 },
  ],
  // Caught: a roar
  roar: [
    { wave: "noise", f0: 900, f1: 300, dur: 0.6, vol: 0.45, decay: 2 },
    { wave: "square", f0: 110, f1: 70, dur: 0.6, vol: 0.3, decay: 1.5, vibrato: 18 },
  ],
  // The gulp: three chomps
  chomp: [0, 0.15, 0.3].map((at) => ({ wave: "noise" as const, f0: 1800, f1: 400, dur: 0.1, at, vol: 0.5, decay: 4 })),
};

mkdirSync(OUT, { recursive: true });
for (const [name, notes] of Object.entries(SOUNDS)) {
  const file = join(OUT, `${name}.wav`);
  writeFileSync(file, wav(render(notes)));
  console.log(`wrote assets/sounds/${name}.wav`);
}
