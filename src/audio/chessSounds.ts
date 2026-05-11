import type { MoveSoundCue } from "../game/types";

export class ChessSoundboard {
  private context: AudioContext | null = null;

  prime() {
    this.ensureContext();
    void this.context?.resume();
  }

  playCue(cue: MoveSoundCue) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    if (cue === "capture") {
      this.playCapture(context);
      return;
    }

    this.playMove(context);
  }

  private ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.context) {
      const AudioContextCtor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) {
        return null;
      }
      this.context = new AudioContextCtor();
    }

    return this.context;
  }

  private playMove(context: AudioContext) {
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const hammer = context.createOscillator();

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(540, now);
    oscillator.frequency.exponentialRampToValueAtTime(360, now + 0.18);

    hammer.type = "sine";
    hammer.frequency.setValueAtTime(1080, now);
    hammer.frequency.exponentialRampToValueAtTime(660, now + 0.06);

    oscillator.connect(gain);
    hammer.connect(gain);
    gain.connect(context.destination);

    oscillator.start(now);
    hammer.start(now);
    oscillator.stop(now + 0.2);
    hammer.stop(now + 0.08);
  }

  private playCapture(context: AudioContext) {
    const now = context.currentTime;
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const noiseGain = context.createGain();
    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.08), context.sampleRate);
    const channel = buffer.getChannelData(0);

    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    oscillator.type = "sawtooth";
    oscillator.frequency.setValueAtTime(300, now);
    oscillator.frequency.exponentialRampToValueAtTime(130, now + 0.22);

    noise.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.18, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

    oscillator.connect(gain);
    noise.connect(noiseGain);
    gain.connect(context.destination);
    noiseGain.connect(context.destination);

    oscillator.start(now);
    noise.start(now);
    oscillator.stop(now + 0.24);
    noise.stop(now + 0.09);
  }
}
