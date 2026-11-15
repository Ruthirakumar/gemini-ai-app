// Client-safe. Groups sub-questions (5a, 5b, 5c…) under their main question
// so practice and results show one main question at a time.

export interface GroupableQuestion {
  questionNumber: string;
  data: { parentNumber: string | null; parentText: string | null };
}

export interface QuestionGroup<Q extends GroupableQuestion> {
  /** Main question label, e.g. "5". */
  label: string;
  /** Shared instructions/data for all parts (e.g. a price list), if any. */
  stem: string | null;
  parts: Q[];
}

/**
 * The main-question number a sub-question belongs to. Uses parentNumber when
 * the extractor set it; otherwise derives it from labels like "5a", "5(b)",
 * "5 - 2" or "5.3". Returns null for standalone questions.
 */
export function mainNumberOf(q: GroupableQuestion): string | null {
  if (q.data.parentNumber?.trim()) return q.data.parentNumber.trim();
  const match = q.questionNumber.trim().match(/^(\d+)\s*(?:\(?[a-z]\)?|[-–.]\s*\d+)$/i);
  return match ? match[1] : null;
}

/** Groups consecutive questions that share a main number. Order is kept. */
export function groupQuestions<Q extends GroupableQuestion>(questions: Q[]): QuestionGroup<Q>[] {
  const groups: (QuestionGroup<Q> & { key: string | null })[] = [];
  for (const q of questions) {
    const key = mainNumberOf(q);
    const last = groups[groups.length - 1];
    // A plain "13" followed by "13-2" also belongs together.
    const joins = last && key !== null && (last.key === key || (last.key === null && last.parts.length === 1 && last.label === key));
    if (joins) {
      last.key = key;
      last.parts.push(q);
      last.stem ??= q.data.parentText;
    } else {
      groups.push({ key, label: key ?? q.questionNumber, stem: q.data.parentText, parts: [q] });
    }
  }
  return groups.map(({ label, stem, parts }) => ({ label, stem, parts }));
}

/** Short label for a part inside its group: "a", "b"… (or its own number if standalone). */
export function partLabel(group: { parts: unknown[] }, index: number, q: GroupableQuestion): string {
  if (group.parts.length === 1) return q.questionNumber;
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}
