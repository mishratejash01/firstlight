/**
 * A quiet bed of sound to sit under the read-aloud voice.
 *
 * Synthesised on the device rather than played from a file: three soft
 * triangle tones a fifth and a third apart, gently detuned against
 * themselves so they shimmer, pushed through a low-pass filter so nothing
 * bright competes with consonants, with a slow swell and a touch of delay for
 * room. No recording is involved, so there is nothing to license, nothing to
 * download and nothing that could ever clash with a word.
 *
 * The level is the whole point. The voice comes out of the speech engine at
 * the device's full volume; this sits at three per cent of that, felt more
 * than heard. Fades in over three seconds so it never pops, out over one and
 * a half so it never cuts.
 */

const LEVEL = 0.03;
const FADE_IN_S = 3;
const FADE_OUT_S = 1.5;

/** D3, A3, F sharp 4: a warm open chord that does not resolve anywhere. */
const TONES: { hz: number; gain: number }[] = [
  { hz: 146.83, gain: 0.5 },
  { hz: 220.0, gain: 0.32 },
  { hz: 369.99, gain: 0.2 },
];

export class AmbientPad {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  /** True when the browser can make sound this way at all. */
  static supported(): boolean {
    return typeof window !== "undefined" && "AudioContext" in window;
  }

  private build(): void {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // A slow breath in the loudness, so the bed moves without ever drawing
    // attention: base 0.85, swelling by 0.15 every twenty-five seconds.
    const swell = ctx.createGain();
    swell.gain.value = 0.85;
    const swellLfo = ctx.createOscillator();
    swellLfo.frequency.value = 0.04;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.15;
    swellLfo.connect(swellDepth).connect(swell.gain);
    swell.connect(master);

    // Everything passes through a low-pass so the bed stays below speech.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    filter.connect(swell);

    const filterLfo = ctx.createOscillator();
    filterLfo.frequency.value = 0.06;
    const filterDepth = ctx.createGain();
    filterDepth.gain.value = 90;
    filterLfo.connect(filterDepth).connect(filter.frequency);

    // A short delay with feedback, mixed low, for a sense of a room.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.37;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = "lowpass";
    delayTone.frequency.value = 400;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    delay.connect(delayTone).connect(feedback).connect(delay);
    delay.connect(wet).connect(swell);
    filter.connect(delay);

    for (const tone of TONES) {
      for (const cents of [-4, 4]) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.value = tone.hz;
        osc.detune.value = cents;
        const gain = ctx.createGain();
        gain.gain.value = tone.gain / 2;
        osc.connect(gain).connect(filter);
        osc.start();
      }
    }
    swellLfo.start();
    filterLfo.start();

    this.ctx = ctx;
    this.master = master;
  }

  /** Fades the bed in. Must be called from a user gesture the first time. */
  async start(): Promise<void> {
    if (!AmbientPad.supported()) return;
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    const gain = this.master!.gain;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(LEVEL, now + FADE_IN_S);
  }

  /** Fades the bed out, then rests the audio context so it costs nothing. */
  stop(): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const gain = this.master.gain;
    const now = ctx.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + FADE_OUT_S);
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = setTimeout(() => {
      this.stopTimer = null;
      if (ctx.state === "running") void ctx.suspend();
    }, FADE_OUT_S * 1000 + 100);
  }

  /** Releases the audio context entirely; for leaving the page. */
  dispose(): void {
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
  }
}
