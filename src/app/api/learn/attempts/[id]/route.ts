import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getAttemptView, getOwnedAttempt } from "@/lib/learn/repository";
import { dbError } from "@/lib/library/repository";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

type Ctx = RouteContext<"/api/learn/attempts/[id]">;

/** GET – the attempt with its questions (no answer keys) and saved answers; results once marked. */
export const GET = route("learn/attempt", async (_request: NextRequest, ctx: Ctx) => {
  const id = assertUuid((await ctx.params).id, "attempt");
  const { supabase } = await requireUser();
  const attempt = await getAttemptView(supabase, id);
  return ok({ attempt });
});

/**
 * DELETE – discards an unfinished attempt and its answers so the child can
 * start again. Finished attempts are kept for the score history.
 */
export const DELETE = route("learn/discard", async (_request: NextRequest, ctx: Ctx) => {
  const id = assertUuid((await ctx.params).id, "attempt");
  const { supabase } = await requireUser();
  const attempt = await getOwnedAttempt(supabase, id); // ownership via RLS
  if (attempt.status !== "in_progress") {
    throw new HomeworkError(
      409,
      attempt.status === "completed" ? "already_completed" : "marking_in_progress",
      attempt.status === "completed"
        ? "Finished homework is kept in your score history and can't be discarded."
        : "This homework is being marked right now, so it can't be discarded."
    );
  }
  // Signed-in users can't delete attempts directly; the service role does it after the checks above.
  const { error } = await createSupabaseAdminClient()
    .from("homework_attempts")
    .delete()
    .eq("id", id)
    .eq("status", "in_progress");
  if (error) dbError("discardAttempt", error);
  console.log("[learn/discard]", { attempt: "discarded" });
  return ok({ discarded: true });
});
