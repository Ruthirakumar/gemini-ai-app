// Client-safe helpers for the read-aloud spelling test and dictionary words.

const WORD = /^[A-Za-z][A-Za-z'’-]*(?: [A-Za-z'’-]+)?$/;
const MIN_WORDS = 3;

function cleanWord(raw: string): string {
  return raw
    .replace(/^\s*(?:and|&)\s+/i, "")
    .replace(/[.;:!?)"“”]+$/g, "")
    .replace(/^[("“”]+/, "")
    .trim();
}

/** "1. Broken" lines (as printed on spelling sheets). */
function numberedWords(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+\s*[.)]\s*(.+?)\s*$/)?.[1] ?? null)
    .filter((w): w is string => w !== null)
    .map(cleanWord)
    .filter((w) => WORD.test(w));
}

/** "Learn the spelling list: Wander, Worry, Swallow and Beware." */
function commaWords(text: string): string[] {
  const afterColon = text.includes(":") ? text.slice(text.lastIndexOf(":") + 1) : text;
  const parts = afterColon.split(/\s*,\s*|\s+and\s+/i).map(cleanWord).filter(Boolean);
  // Every part must look like a word, otherwise this is a sentence, not a list.
  return parts.length >= MIN_WORDS && parts.every((w) => WORD.test(w)) ? parts : [];
}

export interface SpellingList {
  words: string[];
  /** Instructions with the printed word list taken out (so a test doesn't show it). */
  intro: string | null;
}

/**
 * Finds a spelling list to read aloud in an on-paper "learn these spellings"
 * item. Returns null when it isn't a spelling list.
 */
export function findSpellingList(input: {
  questionText: string;
  questionType: string;
  topic?: string | null;
  sectionTitle: string;
  instructions: string | null;
}): SpellingList | null {
  if (input.questionType !== "not_digital") return null;
  const context = [input.sectionTitle, input.instructions ?? "", input.topic ?? "", input.questionText].join(" ");
  if (!/spell/i.test(context)) return null;

  const instructions = input.instructions ?? "";
  const candidates = [numberedWords(instructions), numberedWords(input.questionText), commaWords(input.questionText), commaWords(instructions)];
  const words = candidates.find((list) => list.length >= MIN_WORDS);
  if (!words) return null;

  const intro = instructions
    .split(/\r?\n/)
    .filter((line) => !/^\s*\d+\s*[.)]/.test(line))
    .join("\n")
    .trim();
  return { words: [...new Set(words)], intro: intro || null };
}

/** A shared stem that is just a word or two (e.g. dictionary work: "Adventure"). */
export function isSingleWordStem(stem: string | null | undefined): stem is string {
  return !!stem && stem.trim().length <= 40 && WORD.test(stem.trim());
}

export function isDictionarySection(sectionTitle: string, instructions: string | null): boolean {
  return /dictionary|word class|meaning/i.test(`${sectionTitle} ${instructions ?? ""}`);
}
