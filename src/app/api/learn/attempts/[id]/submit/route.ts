import { NextRequest } from "next/server";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { computeScore, markAnswers } from "@/lib/learn/marking";
import { getAttemptView, getOwnedAttempt, loadMarkableQuestions } from "@/lib/learn/repository";
import { saveAnswersSchema } from "@/lib/learn/types";
import { dbError } from "@/lib/library/repository";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

export const maxDuration = 300;

/** A claim older than this is assumed abandoned (e.g. the server restarted mid-marking). */
const STALE_SUBMISSION_MS = 6 * 60 * 1000;

/**
 * POST – hands in the homework and marks it.
 * Idempotent: a completed attempt returns its stored results; a concurrent
 * submission gets 409; results are upserted per question (never duplicated).
 */
export const POST = route(
  "learn/submit",
  async (request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]/submit">) => {
    const id = assertUuid((await ctx.params).id, "attempt");
    const { supabase } = await requireUser();
    const body = await readJson(request, saveAnswersSchema.partial());

    // 1. Ownership (RLS: the attempt's student must belong to this parent).
    const attempt = await getOwnedAttempt(supabase, id);
    if (attempt.status === "completed") {
      return ok({ attempt: await getAttemptView(supabase, id), alreadyMarked: true });
    }

    // 2. Save any final answers sent with the submission (while still in progress).
    if (attempt.status === "in_progress" && body.answers?.length) {
      const { error } = await supabase.from("student_answers").upsert(
        body.answers.map((a) => ({
          attempt_id: id,
          question_id: a.questionId,
          student_answer: a.answer.trim() ? a.answer : null,
        })),
        { onConflict: "attempt_id,question_id" }
      );
      if (error) dbError("finalSave", error);
    }

    // 3. Atomically claim the attempt for marking.
    const admin = createSupabaseAdminClient();
    const claimedAt = new Date().toISOString();
    let claim = await admin
      .from("homework_attempts")
      .update({ status: "submitted", submitted_at: claimedAt })
      .eq("id", id)
      .eq("status", "in_progress")
      .select("id");
    if (claim.error) dbError("claimAttempt", claim.error);

    if (!claim.data?.length) {
      const current = await getOwnedAttempt(supabase, id);
      if (current.status === "completed") {
        return ok({ attempt: await getAttemptView(supabase, id), alreadyMarked: true });
      }
      const stale =
        current.status === "submitted" &&
        current.submitted_at &&
        Date.now() - new Date(current.submitted_at).getTime() > STALE_SUBMISSION_MS;
      if (!stale) {
        throw new HomeworkError(409, "marking_in_progress", "Your homework is already being marked. Please wait a moment.");
      }
      claim = await admin
        .from("homework_attempts")
        .update({ submitted_at: claimedAt })
        .eq("id", id)
        .eq("status", "submitted")
        .eq("submitted_at", current.submitted_at)
        .select("id");
      if (claim.error) dbError("reclaimAttempt", claim.error);
      if (!claim.data?.length) {
        throw new HomeworkError(409, "marking_in_progress", "Your homework is already being marked. Please wait a moment.");
      }
    }

    const startedAt = Date.now();
    try {
      // 4. Questions with answer keys (server only) and the saved answers.
      const questions = await loadMarkableQuestions(admin, attempt.homework_set_id);
      const { data: answerRows, error: answersError } = await admin
        .from("student_answers")
        .select("question_id, student_answer")
        .eq("attempt_id", id);
      if (answersError) dbError("loadAnswers", answersError);
      const answers = new Map<string, string>(
        (answerRows ?? []).filter((r) => r.student_answer).map((r) => [r.question_id as string, r.student_answer as string])
      );

      // 5-6. Mark (deterministic first, Gemini for the rest; validated).
      const outcomes = await markAnswers(questions, answers);

      // 7. Save individual results (upsert: re-marking never duplicates rows).
      if (outcomes.length > 0) {
        const { error } = await admin.from("student_answers").upsert(
          outcomes.map((o) => ({
            attempt_id: id,
            question_id: o.questionId,
            student_answer: answers.get(o.questionId) ?? null,
            marking_status: o.status,
            awarded_marks: o.awardedMarks,
            correct_answer: o.correctAnswer,
            feedback: o.feedback,
            explanation: o.explanation,
            working_steps: o.workingSteps,
          })),
          { onConflict: "attempt_id,question_id" }
        );
        if (error) dbError("saveResults", error);
      }

      // 8. Score computed here, never trusted from the model or the browser.
      const marksById = new Map(questions.map((q) => [q.id, q.marks]));
      const score = computeScore(outcomes, outcomes.map((o) => marksById.get(o.questionId) ?? 0));

      const { error: finishError } = await admin
        .from("homework_attempts")
        .update({
          status: "completed",
          score: score.score,
          total_marks: score.totalMarks,
          percentage: score.percentage,
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "submitted");
      if (finishError) dbError("finishAttempt", finishError);

      console.log("[learn/submit] marked", {
        questions: outcomes.length,
        ...score.counts,
        ms: Date.now() - startedAt,
      });

      // 9. Return results.
      return ok({ attempt: await getAttemptView(supabase, id), alreadyMarked: false });
    } catch (error) {
      // Release the claim so the student can try again later; answers are kept.
      await admin.from("homework_attempts").update({ status: "in_progress", submitted_at: null }).eq("id", id).eq("status", "submitted");
      throw error;
    }
  }
);
