/**
 * The paper's reading voice, and the engine that drives it.
 *
 * Lifted out of the article's Listen button so the bulletin can use exactly the
 * same voice and the same pacing. A paper reads in one voice; two components
 * each picking their own would mean a story sounding like one reader on the
 * article page and another in the bulletin, which is the one thing a broadcast
 * identity cannot survive.
 *
 * Everything here is the browser's own speech engine, so it costs nothing and
 * sends nothing anywhere: the words already on the page are spoken by the
 * device. See listen-button.tsx for how the fallbacks were chosen.
 */

export const NO_VOICES: SpeechSynthesisVoice[] = [];

const WANTED_VOICE = "Google UK English Male";

function isBritish(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.replace("_", "-").toLowerCase() === "en-gb";
}

/**
 * The stand-ins, in order, for devices without the wanted voice. Each is a
 * British male voice from that platform's own engine: Edge's neural Ryan,
 * Apple's Daniel, and Android's Google voices whose ids mark the male
 * variants. Then any British voice, then any English one.
 */
const FALLBACK_ORDER: ((v: SpeechSynthesisVoice) => boolean)[] = [
  (v) => v.name === WANTED_VOICE,
  (v) => /Ryan/i.test(v.name) && isBritish(v),
  (v) => /^Daniel/i.test(v.name) && isBritish(v),
  (v) => isBritish(v) && /gbb|gbd|rjs/i.test(v.voiceURI),
  (v) => isBritish(v) && /male/i.test(v.name) && !/female/i.test(v.name),
  (v) => isBritish(v),
  (v) => v.lang.toLowerCase().startsWith("en"),
];

/** The wanted voice, else the first stand-in the device has; network voices before local. */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
  for (const matches of FALLBACK_ORDER) {
    const candidates = voices.filter(matches);
    if (candidates.length) {
      return candidates.find((v) => !v.localService) ?? candidates[0];
    }
  }
  return null;
}

export function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/* The engine as an external store. Chrome delivers its voice list after a
   voiceschanged event rather than on first ask, so components subscribe to
   that and re-read. The snapshot is cached by content so React sees the same
   array until the list actually changes. */
let cachedKey = "";
let cachedVoices: SpeechSynthesisVoice[] = NO_VOICES;

export function subscribeVoices(onChange: () => void): () => void {
  if (!hasSpeech()) return () => {};
  window.speechSynthesis.addEventListener("voiceschanged", onChange);
  return () =>
    window.speechSynthesis.removeEventListener("voiceschanged", onChange);
}

export function readVoices(): SpeechSynthesisVoice[] {
  if (!hasSpeech()) return NO_VOICES;
  const list = window.speechSynthesis.getVoices();
  const key = list.map((v) => v.voiceURI).join("|");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedVoices = list;
  }
  return cachedVoices;
}

export function readSupported(): boolean {
  return hasSpeech();
}

export function subscribeNothing(): () => void {
  return () => {};
}

/** Sentence-sized pieces, so pauses fall at full stops and no piece runs long. */
export function toUtterances(blocks: string[]): string[] {
  const pieces: string[] = [];
  for (const block of blocks) {
    const sentences = block.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [block];
    let current = "";
    for (const sentence of sentences) {
      const next = `${current} ${sentence}`.trim();
      if (current && next.length > 220) {
        pieces.push(current);
        current = sentence.trim();
      } else {
        current = next;
      }
    }
    if (current) pieces.push(current);
  }
  return pieces;
}
