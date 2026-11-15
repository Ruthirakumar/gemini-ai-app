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
  /** Retake just this section. Omit for the whole homework. */
  sectionId: z.uuid().nullable().optional(),
});

/**
 * POST – starts homework (or a section retake), or resumes the student's
 * unfinished attempt for the same scope. A unique index guarantees at most one
 * open attempt per student + set + scope.
 */
export const POST = route("learn/start", async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const { studentId, homeworkSetId, sectionId = null } = await readJson(request, bodySchema);
  await getOwnedStudent(supabase, studentId);

  // Visible (own or shared) and published - RLS + this filter.
  const { data: set } = await supabase
    .from("homework_sets")
    .select("id")
    .eq("id", homeworkSetId)
    .eq("status", "published")
    .maybeSingle();
  if (!set) throw new HomeworkError(404, "not_found", "That homework isn't available.");

  if (sectionId) {
    const { data: section } = await supabase
      .from("homework_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("homework_set_id", homeworkSetId)
      .maybeSingle();
    if (!section) throw new HomeworkError(404, "not_found", "That section isn't part of this homework.");
  }

  const findOpen = () => {
    let query = supabase
      .from("homework_attempts")
      .select("id, status")
      .eq("student_id", studentId)
      .eq("homework_set_id", homeworkSetId)
      .in("status", ["in_progress", "submitted"]);
    query = sectionId ? query.eq("section_id", sectionId) : query.is("section_id", null);
    return query.maybeSingle();
  };

  const existing = await findOpen();
  if (existing.error) dbError("findOpenAttempt", existing.error);
  if (existing.data) return ok({ attemptId: existing.data.id, resumed: true });

  const { data, error } = await supabase
    .from("homework_attempts")
    .insert({ student_id: studentId, homework_set_id: homeworkSetId, section_id: sectionId })
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
