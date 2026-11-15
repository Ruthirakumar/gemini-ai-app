import type { SupabaseClient } from "@supabase/supabase-js";
import { HomeworkError } from "@/lib/homework/errors";
import { dbError } from "@/lib/library/repository";
import {
  markingCriteriaSchema,
  questionDataSchema,
  QuestionType,
  SectionSubject,
  SetSubject,
} from "@/lib/library/types";
import { computeScore, MarkableQuestion } from "./marking";
import { StoredCheck, toCheckView } from "./checking";
import {
  attemptProgressSchema,
  CheckView,
  AttemptSummary,
  AttemptView,
  PracticeSectionView,
  QuestionResult,
  StudentProfile,
} from "./types";

interface StudentRow {
  id: string;
  display_name: string;
  school_year: number;
}

export const toStudent = (row: StudentRow): StudentProfile => ({
  id: row.id,
  displayName: row.display_name,
  schoolYear: row.school_year,
});

export async function getOwnedStudent(supabase: SupabaseClient, studentId: string): Promise<StudentProfile> {
  const { data, error } = await supabase
    .from("students")
    .select("id, display_name, school_year")
    .eq("id", studentId)
    .maybeSingle();
  if (error) dbError("getStudent", error);
  if (!data) throw new HomeworkError(404, "not_found", "That student profile couldn't be found.");
  return toStudent(data as StudentRow);
}

export interface AttemptRow {
  id: string;
  student_id: string;
  homework_set_id: string;
  status: AttemptView["status"];
  score: number | null;
  total_marks: number;
  percentage: number | null;
  progress: unknown;
  started_at: string;
  submitted_at: string | null;
}

const ATTEMPT_COLUMNS =
  "id, student_id, homework_set_id, status, score, total_marks, percentage, progress, started_at, submitted_at";

export const toAttemptSummary = (row: AttemptRow): AttemptSummary => ({
  id: row.id,
  homeworkSetId: row.homework_set_id,
  status: row.status,
  score: row.score,
  totalMarks: row.total_marks,
  percentage: row.percentage === null ? null : Number(row.percentage),
  startedAt: row.started_at,
  submittedAt: row.submitted_at,
});

/** Loads an attempt the signed-in parent owns (via RLS on students). */
export async function getOwnedAttempt(supabase: SupabaseClient, attemptId: string): Promise<AttemptRow> {
  const { data, error } = await supabase.from("homework_attempts").select(ATTEMPT_COLUMNS).eq("id", attemptId).maybeSingle();
  if (error) dbError("getAttempt", error);
  if (!data) throw new HomeworkError(404, "not_found", "That homework attempt couldn't be found.");
  return data as AttemptRow;
}

export async function listAttemptsForStudent(supabase: SupabaseClient, studentId: string): Promise<AttemptSummary[]> {
  const { data, error } = await supabase
    .from("homework_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) dbError("listAttempts", error);
  return ((data ?? []) as AttemptRow[]).map(toAttemptSummary);
}

/**
 * Student-facing view of an attempt. Uses the user's client, which cannot
 * read answer keys; correct answers appear only in marked results.
 */
export async function getAttemptView(supabase: SupabaseClient, attemptId: string): Promise<AttemptView> {
  const attempt = await getOwnedAttempt(supabase, attemptId);
  const student = await getOwnedStudent(supabase, attempt.student_id);

  const { data: set, error: setError } = await supabase
    .from("homework_sets")
    .select("id, title, school_year, week_number, subject, original_file_path")
    .eq("id", attempt.homework_set_id)
    .maybeSingle();
  if (setError) dbError("attemptSet", setError);
  if (!set) throw new HomeworkError(404, "not_found", "That homework couldn't be found.");

  const { data: sections, error: sectionsError } = await supabase
    .from("homework_sections")
    .select(
      "id, subject, section_title, instructions, display_order, questions(id, question_number, question_text, question_type, question_data, marks, display_order)"
    )
    .eq("homework_set_id", attempt.homework_set_id)
    .order("display_order", { ascending: true })
    .order("display_order", { referencedTable: "questions", ascending: true });
  if (sectionsError) dbError("attemptSections", sectionsError);

  type SectionRow = {
    id: string;
    subject: SectionSubject;
    section_title: string;
    instructions: string | null;
    questions: {
      id: string;
      question_number: string;
      question_text: string;
      question_type: QuestionType;
      question_data: unknown;
      marks: number;
    }[];
  };

  const practiceSections: PracticeSectionView[] = ((sections ?? []) as SectionRow[]).map((s) => ({
    id: s.id,
    subject: s.subject,
    sectionTitle: s.section_title,
    instructions: s.instructions,
    questions: s.questions.map((q) => {
      const { reviewReason: _hidden, ...data } = questionDataSchema.parse(q.question_data ?? {});
      void _hidden;
      return {
        id: q.id,
        questionNumber: q.question_number,
        questionText: q.question_text,
        questionType: q.question_type,
        marks: q.marks,
        data,
      };
    }),
  }));

  const { data: answerRows, error: answersError } = await supabase
    .from("student_answers")
    .select(
      "question_id, student_answer, marking_status, awarded_marks, correct_answer, feedback, explanation, working_steps, check_count, first_status, first_marks, locked, hint, corrected"
    )
    .eq("attempt_id", attemptId);
  if (answersError) dbError("attemptAnswers", answersError);

  type AnswerRow = StoredCheck & {
    question_id: string;
    student_answer: string | null;
    awarded_marks: number | null;
    corrected: boolean;
  };

  const answers: Record<string, string> = {};
  const checks: Record<string, CheckView> = {};
  for (const row of (answerRows ?? []) as AnswerRow[]) {
    if (row.student_answer) answers[row.question_id] = row.student_answer;
    if (attempt.status !== "completed" && row.check_count > 0) checks[row.question_id] = toCheckView(row.question_id, row);
  }

  let results: AttemptView["results"] = null;
  let score: AttemptView["score"] = null;
  if (attempt.status === "completed") {
    const marksById = new Map(practiceSections.flatMap((s) => s.questions.map((q) => [q.id, q.marks] as const)));
    results = {};
    for (const row of (answerRows ?? []) as AnswerRow[]) {
      if (!row.marking_status || !marksById.has(row.question_id)) continue;
      results[row.question_id] = {
        questionId: row.question_id,
        status: row.marking_status,
        awardedMarks: row.awarded_marks ?? 0,
        marks: marksById.get(row.question_id) ?? 0,
        studentAnswer: row.student_answer,
        correctAnswer: row.correct_answer,
        feedback: row.feedback,
        explanation: row.explanation,
        workingSteps: Array.isArray(row.working_steps) ? (row.working_steps as string[]) : [],
        corrected: row.corrected,
        triesUsed: row.check_count,
      } satisfies QuestionResult;
    }
    const list = Object.values(results);
    // Counts are recomputed; the stored score is the one computed at marking time.
    const recomputed = computeScore(list, list.map((r) => r.marks));
    score = {
      ...recomputed,
      score: attempt.score ?? recomputed.score,
      totalMarks: attempt.total_marks || recomputed.totalMarks,
      percentage: attempt.percentage === null ? recomputed.percentage : Number(attempt.percentage),
    };
  }

  const progress = attemptProgressSchema.safeParse(attempt.progress ?? {});

  return {
    id: attempt.id,
    status: attempt.status,
    student,
    homework: {
      id: set.id,
      title: set.title,
      schoolYear: set.school_year,
      weekNumber: set.week_number,
      subject: set.subject as SetSubject,
      hasFile: Boolean(set.original_file_path),
    },
    sections: practiceSections,
    answers,
    checks,
    progress: progress.success ? progress.data : { currentQuestionId: null, submittedSections: [] },
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    results,
    score,
  };
}

/** Server-only: questions WITH answer keys. Caller must already have verified ownership. */
export async function loadMarkableQuestions(admin: SupabaseClient, setId: string): Promise<MarkableQuestion[]> {
  const { data, error } = await admin
    .from("homework_sections")
    .select(
      "subject, display_order, questions(id, question_number, question_text, question_type, question_data, marking_criteria, marks, display_order)"
    )
    .eq("homework_set_id", setId)
    .order("display_order", { ascending: true })
    .order("display_order", { referencedTable: "questions", ascending: true });
  if (error) dbError("markableQuestions", error);

  type Row = {
    subject: SectionSubject;
    questions: {
      id: string;
      question_number: string;
      question_text: string;
      question_type: QuestionType;
      question_data: unknown;
      marking_criteria: unknown;
      marks: number;
    }[];
  };

  return ((data ?? []) as Row[]).flatMap((s) =>
    s.questions.map((q) => ({
      id: q.id,
      number: q.question_number,
      text: q.question_text,
      type: q.question_type,
      marks: q.marks,
      subject: s.subject,
      data: questionDataSchema.parse(q.question_data ?? {}),
      criteria: markingCriteriaSchema.parse(q.marking_criteria ?? {}),
    }))
  );
}
