/* Pure helpers for reading answers aloud (no browser APIs, so they can be unit tested). */

/** Turns a reply into plain text that sounds right when spoken. */
export function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [label](url) -> label
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "") // list markers
    .replace(/[*_`~]+/g, "")
    .replace(/\p{Extended_Pictographic}️?/gu, " ")
    .replace(/(\d)\s*[×x*]\s*(?=\d)/g, "$1 times ")
    .replace(/(\d)\s*÷\s*(?=\d)/g, "$1 divided by ")
    .replace(/(\d)\s*=\s*(?=\d)/g, "$1 equals ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Splits text into short pieces at sentence (then comma, then word) boundaries.
 * Some browsers silently stop reading very long utterances, so each piece is
 * spoken separately.
 */
export function splitForSpeech(text: string, maxLength = 200): string[] {
  const sentences = text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [];
  const pieces: string[] = [];
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (sentence.length <= maxLength) {
      pieces.push(sentence);
      continue;
    }
    let current = "";
    for (const word of sentence.split(/(?<=,)\s+|\s+/)) {
      if (current && (current + " " + word).length > maxLength) {
        pieces.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) pieces.push(current);
  }
  return pieces;
}

export interface VoiceLike {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

// Natural-sounding British voices on common browsers/OSes, best first.
const PREFERRED_UK_VOICES = ["sonia", "libby", "google uk english female", "serena", "kate", "hazel", "daniel", "google uk english male"];

const normaliseLang = (lang: string) => lang.replace("_", "-").toLowerCase();

/** Picks an English (UK) voice where available, otherwise any English voice. */
export function pickVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  const uk = voices.filter((v) => normaliseLang(v.lang) === "en-gb");
  if (uk.length > 0) {
    const rank = (v: T) => {
      const name = v.name.toLowerCase();
      const preferred = PREFERRED_UK_VOICES.findIndex((p) => name.includes(p));
      return (preferred === -1 ? 100 : preferred) - (name.includes("natural") ? 50 : 0);
    };
    return [...uk].sort((a, b) => rank(a) - rank(b))[0];
  }
  return voices.find((v) => normaliseLang(v.lang).startsWith("en")) ?? null;
}
