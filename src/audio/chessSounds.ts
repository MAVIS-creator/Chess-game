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

    if (cue === "check") {
      this.playCheck(context);
      return;
    }

    if (cue === "checkmate") {
      this.playCheckmate(context);
      return;
    }

    if (cue === "stalemate") {
      this.playStalemate(context);
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

  private playCheck(context: AudioContext) {
    const now = context.currentTime;
    const gain = context.createGain();
    const lead = context.createOscillator();
    const answer = context.createOscillator();

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    lead.type = "square";
    lead.frequency.setValueAtTime(620, now);
    lead.frequency.exponentialRampToValueAtTime(740, now + 0.12);

    answer.type = "triangle";
    answer.frequency.setValueAtTime(520, now + 0.08);
    answer.frequency.exponentialRampToValueAtTime(660, now + 0.22);

    lead.connect(gain);
    answer.connect(gain);
    gain.connect(context.destination);

    lead.start(now);
    answer.start(now + 0.08);
    lead.stop(now + 0.18);
    answer.stop(now + 0.34);
  }

  private playCheckmate(context: AudioContext) {
    const now = context.currentTime;
    const gain = context.createGain();
    const bass = context.createOscillator();
    const mid = context.createOscillator();
    const high = context.createOscillator();

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    bass.type = "triangle";
    bass.frequency.setValueAtTime(220, now);
    bass.frequency.setValueAtTime(174, now + 0.22);
    bass.frequency.setValueAtTime(130.8, now + 0.48);

    mid.type = "sawtooth";
    mid.frequency.setValueAtTime(440, now + 0.04);
    mid.frequency.setValueAtTime(349.2, now + 0.26);
    mid.frequency.setValueAtTime(261.6, now + 0.52);

    high.type = "sine";
    high.frequency.setValueAtTime(659.2, now + 0.08);
    high.frequency.setValueAtTime(523.3, now + 0.3);
    high.frequency.setValueAtTime(392, now + 0.58);

    bass.connect(gain);
    mid.connect(gain);
    high.connect(gain);
    gain.connect(context.destination);

    bass.start(now);
    mid.start(now + 0.04);
    high.start(now + 0.08);
    bass.stop(now + 0.82);
    mid.stop(now + 0.78);
    high.stop(now + 0.72);
  }

  private playStalemate(context: AudioContext) {
    const now = context.currentTime;
    const gain = context.createGain();
    const first = context.createOscillator();
    const second = context.createOscillator();

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    first.type = "sine";
    first.frequency.setValueAtTime(392, now);
    first.frequency.setValueAtTime(349.2, now + 0.2);

    second.type = "triangle";
    second.frequency.setValueAtTime(261.6, now + 0.12);
    second.frequency.setValueAtTime(220, now + 0.36);

    first.connect(gain);
    second.connect(gain);
    gain.connect(context.destination);

    first.start(now);
    second.start(now + 0.12);
    first.stop(now + 0.34);
    second.stop(now + 0.55);
  }
}
