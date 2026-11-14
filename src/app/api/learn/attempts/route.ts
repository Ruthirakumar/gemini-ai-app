import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getOwnedStudent } from "@/lib/learn/repository";
import { dbError } from "@/lib/library/repository";
import { requireUser } from "@/lib/supabase/server";

const bodySchema = z.object({
  studentId: z.uuid(),
  homeworkSetId: z.uuid(),
});

/**
 * POST – starts homework, or resumes the student's unfinished attempt.
 * A partial unique index guarantees at most one open attempt per student+set.
 */
export const POST = route("learn/start", async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { studentId, homeworkSetId } = await readJson(request, bodySchema);
  await getOwnedStudent(supabase, studentId);

  const { data: set } = await supabase
    .from("homework_sets")
    .select("id")
    .eq("id", homeworkSetId)
    .eq("status", "published")
    .maybeSingle();
  if (!set) throw new HomeworkError(404, "not_found", "That homework isn't available.");

  const findOpen = () =>
    supabase
      .from("homework_attempts")
      .select("id, status")
      .eq("student_id", studentId)
      .eq("homework_set_id", homeworkSetId)
      .in("status", ["in_progress", "submitted"])
      .maybeSingle();

  const existing = await findOpen();
  if (existing.error) dbError("findOpenAttempt", existing.error);
  if (existing.data) return ok({ attemptId: existing.data.id, resumed: true });

  const { data, error } = await supabase
    .from("homework_attempts")
    .insert({ student_id: studentId, homework_set_id: homeworkSetId })
    .select("id")
    .single();

  if (error) {
    // Two tabs started at once: the unique index rejected the second insert.
    if (error.code === "23505") {
      const again = await findOpen();
      if (again.data) return ok({ attemptId: again.data.id, resumed: true });
    }
    dbError("createAttempt", error);
  }
  return ok({ attemptId: data.id, resumed: false }, { status: 201 });
});
