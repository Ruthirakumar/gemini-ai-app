import type { MarkingStatus, SectionHistory } from "./types";

export interface HistorySection {
  id: string;
  title: string;
  subject: "English" | "Maths";
  /** question id -> marks available */
  marks: Map<string, number>;
}

export interface HistoryAttempt {
  id: string;
  sectionId: string | null;
  date: string;
}

export interface HistoryAnswer {
  attemptId: string;
  questionId: string;
  status: MarkingStatus | null;
  awardedMarks: number | null;
}

/**
 * Per-section scores over time. A whole-homework attempt adds an entry to
 * every section; a section retake adds one to its section. Questions marked
 * "needs review" are left out of both score and total (as in the main score).
 */
export function buildSectionHistory(sections: HistorySection[], attempts: HistoryAttempt[], answers: HistoryAnswer[]): SectionHistory[] {
  const byAttempt = new Map<string, HistoryAnswer[]>();
  for (const a of answers) byAttempt.set(a.attemptId, [...(byAttempt.get(a.attemptId) ?? []), a]);
  const ordered = [...attempts].sort((a, b) => a.date.localeCompare(b.date));

  return sections.map((section) => {
    const entries = ordered
      .filter((attempt) => attempt.sectionId === null || attempt.sectionId === section.id)
      .map((attempt) => {
        let score = 0;
        let total = 0;
        let counted = 0;
        for (const answer of byAttempt.get(attempt.id) ?? []) {
          const marks = section.marks.get(answer.questionId);
          if (marks === undefined || !answer.status || answer.status === "needs_review") continue;
          score += answer.awardedMarks ?? 0;
          total += marks;
          counted++;
        }
        if (counted === 0) return null;
        return {
          attemptId: attempt.id,
          kind: attempt.sectionId === null ? ("whole" as const) : ("retake" as const),
          date: attempt.date,
          score,
          total,
          percentage: total > 0 ? Math.round((score / total) * 100) : null,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    const percentages = entries.map((e) => e.percentage).filter((p): p is number => p !== null);
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      subject: section.subject,
      entries,
      best: percentages.length ? Math.max(...percentages) : null,
      latest: percentages.length ? percentages[percentages.length - 1] : null,
    };
  });
}
