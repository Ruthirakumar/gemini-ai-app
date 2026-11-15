import { NextRequest } from "next/server";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { applyCheck, EMPTY_CHECK, StoredCheck, toCheckView } from "@/lib/learn/checking";
import { markAnswers } from "@/lib/learn/marking";
import { getOwnedAttempt, loadMarkableQuestions } from "@/lib/learn/repository";
import { CheckView, checkRequestSchema } from "@/lib/learn/types";
import { dbError } from "@/lib/library/repository";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

export const maxDuration = 120;

const CHECK_COLUMNS =
  "question_id, check_count, first_status, first_marks, locked, marking_status, feedback, hint, correct_answer, explanation, working_steps";

/**
 * POST – checks the answers for a few questions (one screen) while the
 * homework is still in progress. Wrong answers get a hint, never the answer,
 * until the last try. The first try is recorded for scoring.
 */
export const POST = route(
  "learn/check",
  async (request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]/check">) => {
    const id = assertUuid((await ctx.params).id, "attempt");
    const { supabase } = await requireUser();
    const { answers } = await readJson(request, checkRequestSchema);

    // Ownership via RLS; only while still in progress.
    const attempt = await getOwnedAttempt(supabase, id);
    if (attempt.status !== "in_progress") {
      throw new HomeworkError(409, "already_submitted", "This homework has already been handed in.");
    }

    const admin = createSupabaseAdminClient();
    const questions = await loadMarkableQuestions(admin, attempt.homework_set_id);
    const byId = new Map(questions.map((q) => [q.id, q]));
    if (answers.some((a) => !byId.has(a.questionId))) {
      throw new HomeworkError(400, "bad_answers", "Some questions don't belong to this homework. Please refresh the page.");
    }

    const { data: existingRows, error: rowsError } = await admin
      .from("student_answers")
      .select(CHECK_COLUMNS)
      .eq("attempt_id", id)
      .in("question_id", answers.map((a) => a.questionId));
    if (rowsError) dbError("loadChecks", rowsError);
    const existing = new Map(((existingRows ?? []) as (StoredCheck & { question_id: string })[]).map((r) => [r.question_id, r]));

    const views: CheckView[] = [];
    const toMark: typeof questions = [];
    const answerMap = new Map<string, string>();

    for (const { questionId, answer } of answers) {
      const question = byId.get(questionId)!;
      const prev = existing.get(questionId);
      if (question.type === "not_digital") continue;
      if (prev?.locked) {
        views.push(toCheckView(questionId, prev)); // already finished: answer can't change
        continue;
      }
      if (!answer.trim()) continue; // nothing to check yet; no try used
      answerMap.set(questionId, answer);
      toMark.push(question);
    }

    if (toMark.length > 0) {
      const outcomes = await markAnswers(toMark, answerMap);
      const rows = outcomes.map((outcome) => {
        const q = byId.get(outcome.questionId)!;
        const hide = [q.criteria.expectedAnswer, ...q.criteria.acceptableAnswers, outcome.correctAnswer ?? ""];
        const { row, view } = applyCheck(existing.get(outcome.questionId) ?? EMPTY_CHECK, outcome, hide);
        views.push(view);
        return { attempt_id: id, question_id: outcome.questionId, student_answer: answerMap.get(outcome.questionId) ?? null, ...row };
      });

      const { error } = await admin.from("student_answers").upsert(rows, { onConflict: "attempt_id,question_id" });
      if (error) dbError("saveChecks", error);
    }

    console.log("[learn/check]", {
      checked: toMark.length,
      states: views.reduce<Record<string, number>>((acc, v) => ({ ...acc, [v.state]: (acc[v.state] ?? 0) + 1 }), {}),
    });
    return ok({ checks: views });
  }
);
