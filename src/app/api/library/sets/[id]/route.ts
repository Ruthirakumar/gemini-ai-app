import { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { removeFigures } from "@/lib/library/figureStorage";
import { dbError, getEditableSet, getSetDetailForEditor } from "@/lib/library/repository";
import { SET_STATUSES, setFieldsSchema } from "@/lib/library/types";
import { WORKSHEET_BUCKET } from "@/lib/supabase/config";
import { createSupabaseAdminClient, requireViewer } from "@/lib/supabase/server";

type Ctx = RouteContext<"/api/library/sets/[id]">;

/** GET – full detail including answer keys (owner, or admin for shared sets). */
export const GET = route("library/detail", async (_request: NextRequest, ctx: Ctx) => {
  const id = assertUuid((await ctx.params).id, "homework");
  const { supabase, userId, isAdmin } = await requireViewer();
  const set = await getSetDetailForEditor(supabase, { userId, isAdmin }, id);
  return ok({ set });
});

// Only the fields actually sent are changed. Defined without defaults on
// purpose: defaults would turn "publish" into "publish and clear the week".
// Visibility can't be changed after creation (it decides who owns the set).
const fields = setFieldsSchema.shape;
const patchSchema = z.object({
  title: fields.title.optional(),
  schoolYear: fields.schoolYear.optional(),
  weekNumber: z.number().int().min(1).max(52).nullable().optional(),
  subject: fields.subject.optional(),
  homeworkDate: z.iso.date().nullable().optional(),
  topic: z.string().trim().max(100).nullable().optional(),
  status: z.enum(SET_STATUSES).optional(),
});

/** PATCH – edit details and/or publish/unpublish. */
export const PATCH = route("library/update", async (request: NextRequest, ctx: Ctx) => {
  const id = assertUuid((await ctx.params).id, "homework");
  const { supabase, userId, isAdmin } = await requireViewer();
  const viewer = { userId, isAdmin };
  const patch = await readJson(request, patchSchema);
  const current = await getEditableSet(supabase, viewer, id);

  if (patch.status === "published") {
    // Publishing rules are checked server-side, not trusted from the UI.
    const detail = await getSetDetailForEditor(supabase, viewer, id);
    if (detail.questionCount === 0) {
      throw new HomeworkError(409, "empty_homework", "Add at least one question before publishing.");
    }
    if (detail.needsReviewCount > 0) {
      throw new HomeworkError(
        409,
        "needs_review",
        `${detail.needsReviewCount} question${detail.needsReviewCount === 1 ? " is" : "s are"} still flagged for review. Please check ${detail.needsReviewCount === 1 ? "it" : "them"} first.`
      );
    }
    const missingAnswers = detail.sections
      .flatMap((s) => s.questions)
      .filter((q) => q.questionType !== "not_digital" && !q.markingCriteria.expectedAnswer.trim());
    if (missingAnswers.length > 0) {
      throw new HomeworkError(
        409,
        "missing_answers",
        `Question ${missingAnswers[0].questionNumber} has no expected answer. Every question needs one before publishing.`
      );
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.schoolYear !== undefined) update.school_year = patch.schoolYear;
  if (patch.subject !== undefined) update.subject = patch.subject;
  if (patch.homeworkDate !== undefined) update.homework_date = patch.homeworkDate;
  if (patch.status !== undefined) update.status = patch.status;
  if (current.visibility === "private" && patch.weekNumber !== undefined) {
    if (patch.weekNumber === null) throw new HomeworkError(400, "invalid_input", "Please choose a week.");
    update.week_number = patch.weekNumber;
  }
  if (current.visibility === "shared" && patch.topic !== undefined) {
    if (!patch.topic?.trim()) throw new HomeworkError(400, "invalid_input", "Please enter a topic.");
    update.topic = patch.topic.trim();
  }
  if (Object.keys(update).length === 0) throw new HomeworkError(400, "bad_request", "Nothing to update.");

  const { data, error } = await supabase.from("homework_sets").update(update).eq("id", id).select("id");
  if (error) dbError("updateSet", error);
  if (!data?.length) throw new HomeworkError(404, "not_found", "That homework couldn't be found.");

  const set = await getSetDetailForEditor(supabase, viewer, id);
  return ok({ set });
});

/** DELETE – removes the set, its questions, attempts, pictures and the original file. */
export const DELETE = route("library/delete", async (_request: NextRequest, ctx: Ctx) => {
  const id = assertUuid((await ctx.params).id, "homework");
  const { supabase, userId, isAdmin } = await requireViewer();
  const set = await getEditableSet(supabase, { userId, isAdmin }, id);

  const admin = createSupabaseAdminClient();
  await removeFigures(admin, set.created_by, id);
  if (set.original_file_path) {
    const { error: storageError } = await admin.storage.from(WORKSHEET_BUCKET).remove([set.original_file_path]);
    if (storageError) console.warn("[library/delete] could not remove file", { name: storageError.name });
  }
  const { error } = await supabase.from("homework_sets").delete().eq("id", id);
  if (error) dbError("deleteSet", error);
  return ok({ deleted: true });
});
