// Sound and haptics: what a game event sounds and feels like. The run loop
// creates one Feedback per screen, calls handle() with each frame's events,
// and dispose() when the screen goes away.
//
// The sounds are synthesized by scripts/make-sounds.ts (npm run sounds).

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import type { GameEvent } from './events';

const SOUNDS = {
  hop: require('../../assets/sounds/hop.wav'),
  ramp: require('../../assets/sounds/ramp.wav'),
  gate: require('../../assets/sounds/gate.wav'),
  style: require('../../assets/sounds/style.wav'),
  crash: require('../../assets/sounds/crash.wav'),
  howl: require('../../assets/sounds/howl.wav'),
  roar: require('../../assets/sounds/roar.wav'),
  chomp: require('../../assets/sounds/chomp.wav'),
} as const;

export type Sound = keyof typeof SOUNDS;

/** Read on every event, so flipping a switch in Settings applies at once. */
export type FeedbackPrefs = () => { sound: boolean; haptics: boolean };

const ignore = () => {}; // haptics reject where there's no vibration (desktop web)

export class Feedback {
  private players = new Map<Sound, AudioPlayer>();

  constructor(private readonly prefs: FeedbackPrefs) {
    // Respect the silent switch, and play over the player's own music rather
    // than stopping it.
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(ignore);
    // Load every sound now, so the first hop doesn't wait on a file.
    for (const name of Object.keys(SOUNDS) as Sound[]) {
      try {
        this.players.set(name, createAudioPlayer(SOUNDS[name]));
      } catch {
        // That sound just won't play.
      }
    }
  }

  handle(e: GameEvent): void {
    switch (e.type) {
      case 'hop':
        this.play('hop');
        break;
      case 'ramp':
        this.play('ramp');
        this.buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        break;
      case 'style':
        if (e.label.startsWith('Gate')) {
          this.play('gate');
          this.buzz(() => Haptics.selectionAsync());
        } else {
          this.play('style');
          this.buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
        }
        break;
      case 'crash':
        this.play('crash');
        this.buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
        break;
      case 'howl':
        this.play('howl');
        this.buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
        break;
      case 'chase':
        break;
      case 'caught':
        this.play('roar');
        this.buzz(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
        break;
    }
  }

  /** The yeti's gulp, timed to the eating animation rather than the sim. */
  gulp(): void {
    this.play('chomp');
    this.buzz(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  }

  dispose(): void {
    for (const p of this.players.values()) p.remove();
    this.players.clear();
  }

  private play(name: Sound) {
    if (!this.prefs().sound) return;
    try {
      const p = this.players.get(name);
      if (!p) return;
      p.seekTo(0).catch(ignore); // replaying rewinds to the start
      p.play();
    } catch {
      // No audio is better than a crashed run.
    }
  }

  private buzz(fn: () => Promise<void>) {
    if (!this.prefs().haptics) return;
    fn().catch(ignore);
  }
}
