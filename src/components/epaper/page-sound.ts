"use client";

/**
 * The sound of a page turning, made in the browser.
 *
 * Synthesised with the Web Audio API rather than played from a recording:
 * nothing to license, nothing to download, and it costs nothing until the
 * first page is turned. Two parts: the sheet sliding (noise swept down
 * through a band-pass filter, like paper brushing paper) and the page
 * settling (a short, softer burst a moment later).
 *
 * Browsers only let a page make sound after the reader has done something,
 * so the audio context is created on the first turn, which is always a
 * click, a key or a swipe.
 *
 * Whether the reader wants it is remembered in their browser; it is on until
 * they turn it off.
 */

const STORAGE_KEY = "tid-epaper-sound";
const CHANGED = "tid-epaper-sound-changed";

let context: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const length = Math.floor(ctx.sampleRate * 0.6);
  noise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noise.getChannelData(0);
  // Brown-ish noise: softer and more papery than plain white noise.
  let last = 0;
  for (let i = 0; i < length; i += 1) {
    last = (last + 0.08 * (Math.random() * 2 - 1)) / 1.08;
    data[i] = last * 3.2;
  }
  return noise;
}

function burst(
  ctx: AudioContext,
  start: number,
  duration: number,
  fromHz: number,
  toHz: number,
  peak: number,
) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 0.9;
  filter.frequency.setValueAtTime(fromHz, start);
  filter.frequency.exponentialRampToValueAtTime(toHz, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + duration * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start, Math.random() * 0.2, duration);
}

/** One page turn. Silent if the reader has turned the sound off. */
export function playPageTurn() {
  if (!soundOn()) return;
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  burst(ctx, now, 0.32, 4200, 900, 0.35);
  burst(ctx, now + 0.24, 0.12, 1800, 600, 0.18);
}

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSound(on: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // A browser that will not store it simply asks again next visit.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** For useSyncExternalStore: tells the toggle when the choice changes. */
export function subscribeToSound(callback: () => void) {
  window.addEventListener(CHANGED, callback);
  return () => window.removeEventListener(CHANGED, callback);
}
