import { z } from "zod";
import type { QuestionData, QuestionType, SectionSubject, SetSubject } from "@/lib/library/types";

// Shared by client and server. Contains NO answer-key fields: expected answers
// only ever appear in results, after the attempt has been marked.

export const MARKING_STATUSES = ["correct", "incorrect", "partially_correct", "unanswered", "needs_review"] as const;
export type MarkingStatus = (typeof MARKING_STATUSES)[number];

export interface StudentProfile {
  id: string;
  displayName: string;
  schoolYear: number;
}

export const studentInputSchema = z.object({
  displayName: z.string().trim().min(1, "Please enter a name").max(40, "That name is a bit long"),
  schoolYear: z.number().int().min(1).max(13),
});

/** What a student sees for a question before marking. */
export interface PracticeQuestionView {
  id: string;
  questionNumber: string;
  questionText: string;
  questionType: QuestionType;
  marks: number;
  data: Omit<QuestionData, "reviewReason">;
}

export interface PracticeSectionView {
  id: string;
  subject: SectionSubject;
  sectionTitle: string;
  instructions: string | null;
  questions: PracticeQuestionView[];
}

export const attemptProgressSchema = z.object({
  currentQuestionId: z.uuid().nullable().default(null),
  submittedSections: z.array(z.uuid()).max(100).default([]),
});
export type AttemptProgress = z.infer<typeof attemptProgressSchema>;

/** Check-as-you-go: tries per question before the answer is shown. */
export const MAX_CHECK_TRIES = 3;

export type CheckState = "correct" | "try_again" | "revealed" | "needs_review";

/** What the child sees after checking a question. Answers appear only when correct or revealed. */
export interface CheckView {
  questionId: string;
  state: CheckState;
  feedback: string;
  hint: string | null;
  triesUsed: number;
  triesLeft: number;
  correctAnswer: string | null;
  explanation: string | null;
  workingSteps: string[];
}

export const checkRequestSchema = z.object({
  answers: z.array(z.object({ questionId: z.uuid(), answer: z.string().max(2000) })).min(1).max(60),
});

export interface QuestionResult {
  questionId: string;
  status: MarkingStatus;
  awardedMarks: number;
  marks: number;
  studentAnswer: string | null;
  correctAnswer: string | null;
  feedback: string | null;
  explanation: string | null;
  workingSteps: string[];
  /** Wrong on the first check but put right afterwards. */
  corrected: boolean;
  /** How many times the child checked this question before handing in. */
  triesUsed: number;
}

export interface ResultCounts {
  correct: number;
  incorrect: number;
  partially_correct: number;
  unanswered: number;
  needs_review: number;
}

export interface AttemptScore {
  score: number;
  totalMarks: number;
  percentage: number | null;
  counts: ResultCounts;
}

export interface AttemptView {
  id: string;
  status: "in_progress" | "submitted" | "completed";
  student: StudentProfile;
  homework: {
    id: string;
    title: string;
    schoolYear: number;
    weekNumber: number;
    subject: SetSubject;
    hasFile: boolean;
  };
  sections: PracticeSectionView[];
  answers: Record<string, string>;
  progress: AttemptProgress;
  startedAt: string;
  submittedAt: string | null;
  /** Check-as-you-go results so far (in-progress attempts). */
  checks: Record<string, CheckView>;
  /** Present only once marked. */
  results: Record<string, QuestionResult> | null;
  score: AttemptScore | null;
}

export interface AttemptSummary {
  id: string;
  homeworkSetId: string;
  status: AttemptView["status"];
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  startedAt: string;
  submittedAt: string | null;
}

export const saveAnswersSchema = z.object({
  answers: z
    .array(z.object({ questionId: z.uuid(), answer: z.string().max(2000) }))
    .max(400),
  progress: attemptProgressSchema.optional(),
});
