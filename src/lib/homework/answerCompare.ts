/**
 * Deterministic answer comparison used to double-check Gemini's marking and to
 * mark simple practice answers without an AI call.
 *
 * Returns "match" / "mismatch" only when it is certain; otherwise "unknown",
 * meaning the decision should be left to Gemini.
 */

export type CompareResult = "match" | "mismatch" | "unknown";

type NumberForm = "integer" | "decimal" | "fraction" | "remainder";

interface ParsedNumber {
  value: number;
  remainder: number | null;
  unit: string | null;
  form: NumberForm;
}

const UNIT_ALIASES: Record<string, string> = {
  cm: "cm", centimetre: "cm", centimetres: "cm", centimeter: "cm", centimeters: "cm",
  mm: "mm", millimetre: "mm", millimetres: "mm",
  m: "m", metre: "m", metres: "m", meter: "m", meters: "m",
  km: "km", kilometre: "km", kilometres: "km",
  g: "g", gram: "g", grams: "g",
  kg: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", millilitre: "ml", millilitres: "ml",
  l: "l", litre: "l", litres: "l",
  p: "p", pence: "p", penny: "p",
  min: "min", mins: "min", minute: "min", minutes: "min",
  s: "s", sec: "s", secs: "s", second: "s", seconds: "s",
  h: "h", hr: "h", hrs: "h", hour: "h", hours: "h",
  "°": "deg", degree: "deg", degrees: "deg",
};

export function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNumberAnswer(raw: string): ParsedNumber | null {
  let s = normaliseText(raw)
    .replace(/^(answer|ans)\s*[:=]\s*/, "")
    .replace(/^=\s*/, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1"); // 1,000 -> 1000

  let unit: string | null = null;
  let moneyPounds = false;

  if (s.startsWith("£")) {
    moneyPounds = true;
    s = s.slice(1).trim();
  }

  // Remainders: "7 r 2", "7r2", "7 remainder 2"
  const rem = s.match(/^(-?\d+)\s*(?:r|rem|remainder)\s*(\d+)$/);
  if (rem) {
    return { value: Number(rem[1]), remainder: Number(rem[2]), unit: null, form: "remainder" };
  }

  const unitMatch = s.match(/^(.*?\d)\s*([a-z°]+)$/);
  if (unitMatch && UNIT_ALIASES[unitMatch[2]]) {
    s = unitMatch[1].trim();
    unit = UNIT_ALIASES[unitMatch[2]];
  }

  let value: number;
  let form: NumberForm;

  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  const fraction = s.match(/^(-?\d+)\s*\/\s*(\d+)$/);

  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    const whole = Number(mixed[1]);
    value = Math.sign(whole || 1) * (Math.abs(whole) + Number(mixed[2]) / denominator);
    form = "fraction";
  } else if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    value = Number(fraction[1]) / denominator;
    form = "fraction";
  } else if (/^-?\d+$/.test(s)) {
    value = Number(s);
    form = "integer";
  } else if (/^-?\d*\.\d+$/.test(s)) {
    value = Number(s);
    form = "decimal";
  } else {
    return null;
  }

  if (moneyPounds) {
    if (unit !== null) return null;
    value = Math.round(value * 100);
    unit = "p";
    form = "integer";
  }

  return { value, remainder: null, unit, form };
}

function numbersEqual(a: ParsedNumber, b: ParsedNumber): boolean | null {
  if (a.unit && b.unit && a.unit !== b.unit) return null; // different units: can't decide
  if (a.form === "remainder" || b.form === "remainder") {
    if (a.form !== b.form) return null;
    return a.value === b.value && a.remainder === b.remainder;
  }
  return Math.abs(a.value - b.value) < 1e-9;
}

/** Whitespace/quote normalisation only: keeps case and punctuation. */
const exactForm = (value: string) =>
  value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

/**
 * Compares a student answer with expected answers.
 * @param strictForm when true (e.g. "write 3/4 as a decimal") a numerically equal
 *   answer in a different form (fraction vs decimal) is left to Gemini.
 * @param exactText when true, a text match must keep case and punctuation
 *   (questions may test capital letters or punctuation); near-matches are
 *   left to Gemini, which knows what the question tests.
 */
export function compareAnswers(
  student: string,
  expected: string,
  acceptable: string[] = [],
  {
    numeric = false,
    strictForm = true,
    exactText = false,
  }: { numeric?: boolean; strictForm?: boolean; exactText?: boolean } = {}
): CompareResult {
  const candidates = [expected, ...acceptable].filter((c) => c.trim().length > 0);
  const studentText = normaliseText(student);
  if (!studentText) return "unknown";

  if (exactText && !numeric) {
    const studentExact = exactForm(student);
    return candidates.some((c) => exactForm(c) === studentExact) ? "match" : "unknown";
  }

  if (candidates.some((c) => normaliseText(c) === studentText)) return "match";

  if (!numeric) return "unknown";

  const studentNumber = parseNumberAnswer(student);
  if (!studentNumber) return "unknown";

  let anyDecided = false;
  for (const candidate of candidates) {
    const expectedNumber = parseNumberAnswer(candidate);
    if (!expectedNumber) continue;
    const equal = numbersEqual(studentNumber, expectedNumber);
    if (equal === null) continue;
    anyDecided = true;
    if (equal) {
      if (!strictForm || studentNumber.form === expectedNumber.form) return "match";
      return "unknown"; // same value, different form: let Gemini judge
    }
  }

  // Only a definite mismatch if every parseable candidate compared and differed.
  return anyDecided ? "mismatch" : "unknown";
}

/**
 * True if `text` (a hint or feedback) contains any of the answers as a whole
 * word or phrase - used to stop hints giving the answer away.
 */
export function revealsAnswer(text: string | null | undefined, answers: string[]): boolean {
  if (!text) return false;
  const clean = (value: string) => normaliseText(value).replace(/[^a-z0-9./ ]/g, " ").replace(/\s+/g, " ").trim();
  const haystack = ` ${clean(text)} `;
  return answers.some((answer) => {
    const needle = clean(answer);
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}
