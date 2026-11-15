import { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { dbError, getSetDetailForEditor, getVisibleSet } from "@/lib/library/repository";
import { createSupabaseAdminClient, requireViewer } from "@/lib/supabase/server";

const bodySchema = z.discriminatedUnion("visibility", [
  z.object({
    visibility: z.literal("shared"),
    topic: z.string().trim().min(1, "Please enter a topic").max(100),
  }),
  z.object({ visibility: z.literal("private") }),
]);

/**
 * POST – share an admin's own homework with every family (moves it to the
 * shared library: same questions, pictures and scores), or make it private
 * again. Only the admin who created it can do either.
 */
export const POST = route(
  "library/visibility",
  async (request: NextRequest, ctx: RouteContext<"/api/library/sets/[id]/visibility">) => {
    const id = assertUuid((await ctx.params).id, "homework");
    const { supabase, userId, isAdmin } = await requireViewer();
    const viewer = { userId, isAdmin };
    const body = await readJson(request, bodySchema);

    if (!isAdmin) {
      throw new HomeworkError(403, "not_allowed", "Only an admin can share homework with everyone.");
    }
    const set = await getVisibleSet(supabase, id);
    if (set.created_by !== userId) {
      throw new HomeworkError(403, "not_allowed", "Only the admin who added this homework can change who can see it.");
    }
    if (set.visibility === body.visibility) {
      return ok({ set: await getSetDetailForEditor(supabase, viewer, id) });
    }

    if (body.visibility === "private") {
      // Making it private would hide other families' scores: block it if they've used it.
      const admin = createSupabaseAdminClient();
      const { data: attempts, error } = await admin
        .from("homework_attempts")
        .select("id, students!inner(parent_id)")
        .eq("homework_set_id", id)
        .neq("students.parent_id", userId)
        .limit(1);
      if (error) dbError("otherFamiliesAttempts", error);
      if ((attempts ?? []).length > 0) {
        throw new HomeworkError(
          409,
          "used_by_others",
          "Other families' children have already practised this, so it can't be made private (that would hide their scores). You can unpublish it instead."
        );
      }
      if (set.week_number === null) {
        throw new HomeworkError(400, "needs_week", "Give it a week number first, then make it private.");
      }
    }

    const update =
      body.visibility === "shared"
        ? { visibility: "shared", topic: body.topic }
        : { visibility: "private" };
    // RLS also enforces the rules: only admins can make a set shared, and only
    // the creator can make it private again.
    const { data, error } = await supabase.from("homework_sets").update(update).eq("id", id).select("id");
    if (error) dbError("changeVisibility", error);
    if (!data?.length) throw new HomeworkError(403, "not_allowed", "You can't change who can see this homework.");

    console.log("[library/visibility]", { to: body.visibility });
    return ok({ set: await getSetDetailForEditor(supabase, viewer, id) });
  }
);
