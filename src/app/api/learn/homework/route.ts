import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getOwnedStudent, listAttemptsForStudent } from "@/lib/learn/repository";
import { listSets } from "@/lib/library/repository";
import type { HomeworkSetSummary } from "@/lib/library/types";
import { requireViewer } from "@/lib/supabase/server";

/** Only what a child needs to see about a set. */
const forChild = (s: HomeworkSetSummary) => ({
  id: s.id,
  title: s.title,
  schoolYear: s.schoolYear,
  weekNumber: s.weekNumber,
  topic: s.topic,
  subject: s.subject,
  homeworkDate: s.homeworkDate,
  questionCount: s.questionCount,
  sectionCount: s.sectionCount,
});

/**
 * GET /api/learn/homework?studentId=...&year=4&week=8
 * homework: the family's own published homework. shared: published shared
 * library sets for the year. Plus this child's attempts.
 */
export const GET = route("learn/homework", async (request: NextRequest) => {
  const { supabase, userId, isAdmin } = await requireViewer();
  const viewer = { userId, isAdmin };
  const params = request.nextUrl.searchParams;
  const studentId = params.get("studentId");
  if (!studentId) throw new HomeworkError(400, "bad_request", "Please choose who is practising.");
  const student = await getOwnedStudent(supabase, assertUuid(studentId, "student"));

  const year = Number(params.get("year")) || student.schoolYear;
  const week = Number(params.get("week")) || undefined;

  const [own, shared, attempts] = await Promise.all([
    listSets(supabase, viewer, { visibility: "private", year, week, status: "published" }),
    listSets(supabase, viewer, { visibility: "shared", year, status: "published" }),
    listAttemptsForStudent(supabase, student.id),
  ]);

  return ok({
    student,
    homework: own.filter((s) => s.questionCount > 0).map(forChild),
    shared: shared.filter((s) => s.questionCount > 0).map(forChild),
    attempts,
  });
});
