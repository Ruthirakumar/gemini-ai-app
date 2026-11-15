import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { buildSectionHistory } from "@/lib/learn/history";
import { getOwnedStudent, toAttemptSummary, type AttemptRow } from "@/lib/learn/repository";
import type { HomeworkHistory, MarkingStatus } from "@/lib/learn/types";
import { dbError, getVisibleSet } from "@/lib/library/repository";
import type { SectionSubject } from "@/lib/library/types";
import { requireUser } from "@/lib/supabase/server";

/**
 * GET /api/learn/history?studentId=...&setId=...
 * The child's score for every section on every finished attempt (whole
 * homework and section retakes), plus all their attempts for this homework.
 */
export const GET = route("learn/history", async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const params = request.nextUrl.searchParams;
  const studentId = params.get("studentId");
  const setId = params.get("setId");
  if (!studentId || !setId) throw new HomeworkError(400, "bad_request", "Please choose a child and a homework.");

  const student = await getOwnedStudent(supabase, assertUuid(studentId, "student"));
  const set = await getVisibleSet(supabase, assertUuid(setId, "homework"));

  const { data: sections, error: sectionsError } = await supabase
    .from("homework_sections")
    .select("id, subject, section_title, display_order, questions(id, marks, question_type)")
    .eq("homework_set_id", set.id)
    .order("display_order", { ascending: true });
  if (sectionsError) dbError("historySections", sectionsError);

  const { data: attemptRows, error: attemptsError } = await supabase
    .from("homework_attempts")
    .select("id, student_id, homework_set_id, section_id, status, score, total_marks, percentage, progress, started_at, submitted_at")
    .eq("student_id", student.id)
    .eq("homework_set_id", set.id)
    .order("started_at", { ascending: false })
    .limit(50);
  if (attemptsError) dbError("historyAttempts", attemptsError);
  const attempts = (attemptRows ?? []) as AttemptRow[];
  const completed = attempts.filter((a) => a.status === "completed");

  const { data: answerRows, error: answersError } = completed.length
    ? await supabase
        .from("student_answers")
        .select("attempt_id, question_id, marking_status, awarded_marks")
        .in("attempt_id", completed.map((a) => a.id))
    : { data: [], error: null };
  if (answersError) dbError("historyAnswers", answersError);

  type SectionRow = { id: string; subject: SectionSubject; section_title: string; questions: { id: string; marks: number; question_type: string }[] };
  const history = buildSectionHistory(
    ((sections ?? []) as SectionRow[]).map((s) => ({
      id: s.id,
      title: s.section_title,
      subject: s.subject,
      marks: new Map(s.questions.filter((q) => q.question_type !== "not_digital").map((q) => [q.id, q.marks])),
    })),
    completed.map((a) => ({ id: a.id, sectionId: a.section_id, date: a.submitted_at ?? a.started_at })),
    (answerRows ?? []).map((r) => ({
      attemptId: r.attempt_id as string,
      questionId: r.question_id as string,
      status: r.marking_status as MarkingStatus | null,
      awardedMarks: r.awarded_marks as number | null,
    }))
  );

  const result: HomeworkHistory = {
    homework: { id: set.id, title: set.title, schoolYear: set.school_year, weekNumber: set.week_number, topic: set.topic, subject: set.subject },
    student,
    sections: history,
    attempts: attempts.map(toAttemptSummary),
  };
  return ok({ history: result });
});
