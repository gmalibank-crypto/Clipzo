// Web Audio synthesizer for live soundtrack previews and recording audio mixing

export type SfxPreset = 'Bass Drop' | 'Shutter' | 'Airhorn' | 'Vinyl Scratch' | 'Sparkle';

export const SFX_PRESETS: Array<{ id: SfxPreset; label: string }> = [
  { id: 'Bass Drop', label: 'Bass Drop' },
  { id: 'Shutter', label: 'Shutter' },
  { id: 'Airhorn', label: 'Airhorn' },
  { id: 'Vinyl Scratch', label: 'Scratch' },
  { id: 'Sparkle', label: 'Chime' },
];

class VeloAudioEngine {
  private ctx: AudioContext | null = null;
  private loopTimer: number | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private activePreset: string | null = null;

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public getMixStream(): MediaStream {
    const ctx = this.ensureContext();
    if (!this.destination) {
      this.destination = ctx.createMediaStreamDestination();
    }
    return this.destination.stream;
  }

  private connectOutput(node: AudioNode): void {
    const ctx = this.ensureContext();
    node.connect(ctx.destination);
    if (this.destination) {
      node.connect(this.destination);
    }
  }

  public startSoundtrackLoop(preset: string, bpm = 118): void {
    this.stopSoundtrackLoop();
    const ctx = this.ensureContext();
    this.activePreset = preset;

    const stepMs = Math.max(180, Math.round((60 / bpm / 2) * 1000));
    let step = 0;

    const scaleMap: Record<string, number[]> = {
      midnight_sub: [110, 130.81, 164.81, 196, 146.83, 164.81, 220, 196],
      amber_arp: [261.63, 329.63, 392, 493.88, 392, 329.63, 293.66, 392],
      rooftop_break: [98, 98, 146.83, 130.81, 98, 196, 146.83, 110],
      kinetic_pulse: [130.81, 164.81, 196, 261.63, 196, 164.81, 146.83, 196],
      neon_chords: [146.83, 220, 261.63, 293.66, 220, 261.63, 329.63, 293.66],
    };
    const notes = scaleMap[preset] || scaleMap.midnight_sub;

    const playStep = () => {
      if (!this.activePreset) return;
      const now = ctx.currentTime;
      const freq = notes[step % notes.length];

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = preset === 'rooftop_break' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + stepMs / 1000);

      osc.connect(gain);
      this.connectOutput(gain);
      osc.start(now);
      osc.stop(now + stepMs / 1000 + 0.02);

      // Subtle kick pulse every 2 steps
      if (step % 2 === 0) {
        const kick = ctx.createOscillator();
        const kGain = ctx.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(115, now);
        kick.frequency.exponentialRampToValueAtTime(42, now + 0.12);
        kGain.gain.setValueAtTime(0.16, now);
        kGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        kick.connect(kGain);
        this.connectOutput(kGain);
        kick.start(now);
        kick.stop(now + 0.15);
      }

      step += 1;
    };

    playStep();
    this.loopTimer = window.setInterval(playStep, stepMs);
  }

  public stopSoundtrackLoop(): void {
    this.activePreset = null;
    if (this.loopTimer !== null) {
      window.clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
  }

  public triggerSfx(preset: SfxPreset): void {
    const ctx = this.ensureContext();
    const now = ctx.currentTime;

    if (preset === 'Bass Drop') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.65);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.connect(gain);
      this.connectOutput(gain);
      osc.start(now);
      osc.stop(now + 0.72);
    } else if (preset === 'Shutter') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.055);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      this.connectOutput(gain);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (preset === 'Airhorn') {
      [440, 554.37, 659.25].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        this.connectOutput(gain);
        osc.start(now);
        osc.stop(now + 0.36);
      });
    } else if (preset === 'Vinyl Scratch') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(190, now + 0.12);
      osc.frequency.linearRampToValueAtTime(480, now + 0.22);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      this.connectOutput(gain);
      osc.start(now);
      osc.stop(now + 0.26);
    } else {
      // Sparkle chime
      [587.33, 880, 1174.66].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.05);
        gain.gain.setValueAtTime(0.001, now + i * 0.05);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.05 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.35);
        osc.connect(gain);
        this.connectOutput(gain);
        osc.start(now + i * 0.05);
        osc.stop(now + i * 0.05 + 0.37);
      });
    }
  }
}

export const audioEngine = new VeloAudioEngine();
