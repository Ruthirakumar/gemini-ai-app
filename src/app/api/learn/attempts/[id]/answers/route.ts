import { NextRequest } from "next/server";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getOwnedAttempt } from "@/lib/learn/repository";
import { saveAnswersSchema } from "@/lib/learn/types";
import { dbError } from "@/lib/library/repository";
import { requireUser } from "@/lib/supabase/server";

/**
 * PUT – saves answers and position. Uses the user's client: RLS and column
 * privileges allow only the answer text to be written, only while in progress.
 */
export const PUT = route(
  "learn/save",
  async (request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]/answers">) => {
    const id = assertUuid((await ctx.params).id, "attempt");
    const { supabase } = await requireUser();
    const body = await readJson(request, saveAnswersSchema);
    const attempt = await getOwnedAttempt(supabase, id);
    if (attempt.status !== "in_progress") {
      throw new HomeworkError(409, "already_submitted", "This homework has already been handed in.");
    }

    // Questions already finished by checking (correct or revealed) can't change.
    let editable = body.answers;
    if (editable.length > 0) {
      const { data: lockedRows, error: lockedError } = await supabase
        .from("student_answers")
        .select("question_id")
        .eq("attempt_id", id)
        .eq("locked", true);
      if (lockedError) dbError("loadLocked", lockedError);
      const locked = new Set((lockedRows ?? []).map((r) => r.question_id as string));
      editable = editable.filter((a) => !locked.has(a.questionId));
    }

    if (editable.length > 0) {
      const rows = editable.map((a) => ({
        attempt_id: id,
        question_id: a.questionId,
        student_answer: a.answer.trim() ? a.answer : null,
      }));
      const { error } = await supabase
        .from("student_answers")
        .upsert(rows, { onConflict: "attempt_id,question_id" });
      if (error) {
        // 23503 = question doesn't exist; 42501 = RLS refused (wrong set / not in progress).
        if (error.code === "23503" || error.code === "42501") {
          throw new HomeworkError(400, "bad_answers", "Some answers couldn't be saved. Please refresh the page.");
        }
        dbError("saveAnswers", error);
      }
    }

    if (body.progress) {
      const { error } = await supabase.from("homework_attempts").update({ progress: body.progress }).eq("id", id);
      if (error) dbError("saveProgress", error);
    }

    return ok({ savedAt: new Date().toISOString() });
  }
);
