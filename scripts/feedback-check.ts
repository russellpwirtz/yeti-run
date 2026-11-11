// ============================================
// Events, pop-ups and pixel text — run with: npm test
// ============================================
// The game's moments (hops, gates, crashes, the yeti) are read off the sim by
// EventWatcher; sound, haptics and the score pop-ups all hang off them. Same
// loud-failure style as sim-check.ts.

import { GLYPH_CHARS, pixelText } from "../src/game/art";
import { makeSteerBot, type Bot } from "../src/game/bots";
import { RunEngine } from "../src/game/engine";
import type { GameEvent } from "../src/game/events";
import { POP_LIFE_S, PopFeed } from "../src/game/pops";
import { DOWNHILL, pressAction, setAim, STEP_S, TRICKS } from "../src/game/sim";

let fails = 0;
function ok(label: string, cond: boolean, extra = "") {
  if (!cond) fails++;
  console.log(`${cond ? "  ok" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
}

const count = (es: GameEvent[], type: GameEvent["type"]) => es.filter((e) => e.type === type).length;

console.log("events from whole runs");
{
  // Ski until the yeti gets you, once steering around everything and once
  // pointing straight down (which hits plenty), and compare the events with
  // the sim's own tallies.
  const straightDown: Bot = (s) => setAim(s, DOWNHILL);
  const players: [string, () => Bot][] = [["steering", () => makeSteerBot(false)], ["straight down", () => straightDown]];
  for (const [who, bot] of players) {
    for (const seed of [1, 2, 3]) {
      const e = new RunEngine(seed, bot());
      const evs: GameEvent[] = [];
      while (e.advance(STEP_S * 10)) evs.push(...e.takeEvents());
      evs.push(...e.takeEvents());
      const label = `${who}, seed ${seed}`;
      const yeti = evs.filter((x) => x.type === "howl" || x.type === "chase" || x.type === "caught");
      ok(`${label}: howl, chase, caught — once each, in order`, yeti.map((x) => x.type).join() === "howl,chase,caught");
      const stylePts = evs.reduce((n, x) => n + (x.type === "style" ? x.pts : 0), 0);
      ok(`${label}: every style point arrives as an event`, stylePts === e.sim.style, `${stylePts} pts`);
      ok(`${label}: one crash event per crash`, count(evs, "crash") === e.sim.crashes, `${e.sim.crashes} crashes`);
    }
  }
}
{
  const e = new RunEngine(7);
  pressAction(e.sim);
  e.advance(STEP_S);
  const evs = e.takeEvents();
  ok("a hop at the top is a hop event", count(evs, "hop") === 1);
  e.advance(1);
  ok("…and not repeated while airborne or on landing", count(e.takeEvents(), "hop") === 0);
  ok("takeEvents empties the queue", e.takeEvents().length === 0);
}

console.log("pop-ups");
{
  const feed = new PopFeed();
  feed.push([{ type: "style", label: "Gate ×2", pts: 50 }], 0);
  feed.push([{ type: "crash", kind: "wipeout" }, { type: "crash", kind: "tree" }, { type: "hop" }], 0.1);
  let live = feed.live(0.2);
  ok("gates and wipeouts pop; trees and hops don't", live.length === 2, live.map((p) => p.text).join(" | "));
  ok("gate pops are gold-toned and upper-case", live[0].tone === "gate" && live[0].text === "GATE ×2 +50");
  ok("the newest pop sits in slot 0", live[1].text === "WIPEOUT!" && live[1].slot === 0 && live[0].slot === 1);
  live = feed.live(POP_LIFE_S + 0.05);
  ok("pops expire after their life", live.length === 1 && live[0].text === "WIPEOUT!");
  for (let i = 0; i < 5; i++) feed.push([{ type: "style", label: "Air", pts: 10 }], 2);
  ok("at most three at once", feed.live(2).length === 3);
}

console.log("pixel text");
{
  const labels = ["Gate", "Gate ×12", "Air", "Clean landing", "Wipeout!", "YETI RUN", ...TRICKS.map((t) => t.name)];
  for (const l of labels) {
    const text = `${l} +0123456789`.toUpperCase();
    const missing = [...text].filter((ch) => !GLYPH_CHARS.has(ch));
    ok(`every character of "${l}" has a glyph`, missing.length === 0, missing.join(""));
  }
  ok("the same text comes back as the same art (picture cache)", pixelText("GATE", "#fff") === pixelText("GATE", "#fff"));
}

console.log(fails === 0 ? "\nall feedback checks passed" : `\n${fails} check(s) FAILED`);
process.exit(fails === 0 ? 0 : 1);
