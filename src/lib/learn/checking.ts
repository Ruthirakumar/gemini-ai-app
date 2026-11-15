import { revealsAnswer } from "@/lib/homework/answerCompare";
import type { MarkOutcome } from "./marking";
import { CheckState, CheckView, MarkingStatus, MAX_CHECK_TRIES } from "./types";

type CheckedStatus = Exclude<MarkingStatus, "unanswered">;

/** The check-related columns of a student_answers row. */
export interface StoredCheck {
  check_count: number;
  first_status: CheckedStatus | null;
  first_marks: number | null;
  locked: boolean;
  marking_status: MarkingStatus | null;
  feedback: string | null;
  hint: string | null;
  correct_answer: string | null;
  explanation: string | null;
  working_steps: unknown;
}

export const EMPTY_CHECK: StoredCheck = {
  check_count: 0,
  first_status: null,
  first_marks: null,
  locked: false,
  marking_status: null,
  feedback: null,
  hint: null,
  correct_answer: null,
  explanation: null,
  working_steps: null,
};

const KEEP_TRYING = [
  "Not quite yet - have another go!",
  "Nearly! Have another look.",
  "Good try! Check it again.",
];

/**
 * Applies one check to a question. Rules:
 *  - correct -> locked; answer and explanation shown
 *  - wrong   -> hint only (never the answer) until MAX_CHECK_TRIES, then the
 *               answer is revealed and the question locked
 *  - needs_review -> locked; a grown-up will check it
 * The FIRST checked result is kept for scoring.
 */
export function applyCheck(prev: StoredCheck, outcome: MarkOutcome, answersToHide: string[]): { row: StoredCheck & { awarded_marks: number; corrected: boolean }; view: CheckView } {
  const status = outcome.status as CheckedStatus;
  const tries = prev.check_count + 1;
  const firstStatus = prev.first_status ?? status;
  const firstMarks = prev.first_marks ?? outcome.awardedMarks;

  let state: CheckState;
  if (status === "correct") state = "correct";
  else if (status === "needs_review") state = "needs_review";
  else state = tries >= MAX_CHECK_TRIES ? "revealed" : "try_again";

  const showAnswer = state === "correct" || state === "revealed";
  const safe = (text: string | null) => (text && !revealsAnswer(text, answersToHide) ? text : null);

  const feedback =
    state === "correct"
      ? outcome.feedback
      : state === "revealed"
        ? "That was a tricky one - well done for sticking with it! Here's how to do it."
        : state === "needs_review"
          ? "A grown-up will check this one with you."
          : safe(outcome.feedback) ?? KEEP_TRYING[(tries - 1) % KEEP_TRYING.length];

  const hint = state === "try_again" ? safe(outcome.hint) ?? "Read the question again slowly and check each step." : null;

  const row = {
    check_count: tries,
    first_status: firstStatus,
    first_marks: firstMarks,
    locked: state !== "try_again",
    marking_status: status,
    awarded_marks: outcome.awardedMarks,
    feedback,
    hint,
    // Saved only once it can be shown, so it can't be looked up early.
    correct_answer: showAnswer ? outcome.correctAnswer : null,
    explanation: showAnswer ? outcome.explanation : null,
    working_steps: showAnswer ? outcome.workingSteps : null,
    corrected: status === "correct" && firstStatus !== "correct",
  };

  return { row, view: toCheckView(outcome.questionId, row) };
}

/** Rebuilds what the child sees from a saved row (e.g. after a page reload). */
export function toCheckView(questionId: string, row: StoredCheck): CheckView {
  const state: CheckState = !row.locked
    ? "try_again"
    : row.marking_status === "correct"
      ? "correct"
      : row.marking_status === "needs_review"
        ? "needs_review"
        : "revealed";
  return {
    questionId,
    state,
    feedback: row.feedback ?? "",
    hint: row.hint,
    triesUsed: row.check_count,
    triesLeft: row.locked ? 0 : Math.max(0, MAX_CHECK_TRIES - row.check_count),
    correctAnswer: row.correct_answer,
    explanation: row.explanation,
    workingSteps: Array.isArray(row.working_steps) ? (row.working_steps as string[]) : [],
  };
}
