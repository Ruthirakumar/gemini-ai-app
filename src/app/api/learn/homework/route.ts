import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getOwnedStudent, listAttemptsForStudent } from "@/lib/learn/repository";
import { listSets } from "@/lib/library/repository";
import { requireUser } from "@/lib/supabase/server";

/**
 * GET /api/learn/homework?studentId=...&year=4&week=8
 * Published homework only, plus this student's attempts.
 */
export const GET = route("learn/homework", async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const params = request.nextUrl.searchParams;
  const studentId = params.get("studentId");
  if (!studentId) throw new HomeworkError(400, "bad_request", "Please choose who is practising.");
  const student = await getOwnedStudent(supabase, assertUuid(studentId, "student"));

  const year = Number(params.get("year")) || student.schoolYear;
  const week = Number(params.get("week")) || undefined;

  const [sets, attempts] = await Promise.all([
    listSets(supabase, { year, week, status: "published" }),
    listAttemptsForStudent(supabase, student.id),
  ]);

  // Only expose what a student needs about each set.
  const homework = sets
    .filter((s) => s.questionCount > 0)
    .map((s) => ({
      id: s.id,
      title: s.title,
      schoolYear: s.schoolYear,
      weekNumber: s.weekNumber,
      subject: s.subject,
      homeworkDate: s.homeworkDate,
      questionCount: s.questionCount,
    }));

  return ok({ student, homework, attempts });
});
