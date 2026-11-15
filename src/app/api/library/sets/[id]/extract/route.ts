import { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { MAX_LIBRARY_FILE_BYTES } from "@/lib/homework/constants";
import { HomeworkError } from "@/lib/homework/errors";
import { validateWorksheetBuffer } from "@/lib/homework/image";
import { extractHomework } from "@/lib/library/extraction";
import { attachFigures, removeFigures } from "@/lib/library/figureStorage";
import { dbError, getEditableSet, getSetDetailForEditor, saveSetContent } from "@/lib/library/repository";
import { WORKSHEET_BUCKET } from "@/lib/supabase/config";
import { createSupabaseAdminClient, requireViewer } from "@/lib/supabase/server";

// Long PDFs are extracted in parallel chunks; allow time for the slowest chunk.
export const maxDuration = 300;

const bodySchema = z.object({
  /** Set after the browser uploads a new file to private storage. Omit to re-run on the existing file. */
  filePath: z.string().max(400).optional(),
  fileName: z.string().max(200).optional(),
});

const STALE_PROCESSING_MS = 6 * 60 * 1000;

export const POST = route(
  "library/extract",
  async (request: NextRequest, ctx: RouteContext<"/api/library/sets/[id]/extract">) => {
    const id = assertUuid((await ctx.params).id, "homework");
    const { supabase, userId, isAdmin } = await requireViewer();
    const viewer = { userId, isAdmin };
    const body = await readJson(request, bodySchema);
    const set = await getEditableSet(supabase, viewer, id);
    // Files live in the creator's folder; access was just checked, so use the service role for storage.
    const storage = createSupabaseAdminClient();

    if (set.status === "published") {
      throw new HomeworkError(409, "published", "Unpublish this homework before extracting the questions again.");
    }
    if (
      set.extraction_status === "processing" &&
      Date.now() - new Date(set.updated_at).getTime() < STALE_PROCESSING_MS
    ) {
      throw new HomeworkError(409, "busy", "Questions are already being extracted for this homework. Please wait.");
    }
    const { count: attempts } = await storage
      .from("homework_attempts")
      .select("id", { count: "exact", head: true })
      .eq("homework_set_id", id);
    if ((attempts ?? 0) > 0) {
      throw new HomeworkError(409, "has_attempts", "Students have already started this homework, so it can't be re-extracted. Create a new homework instead.");
    }

    // The file must be inside this user's folder for this set.
    const filePath = body.filePath ?? set.original_file_path;
    if (!filePath) throw new HomeworkError(400, "no_file", "Please upload the homework file first.");
    const expectedPrefix = `${set.created_by}/${id}/`;
    if (!filePath.startsWith(expectedPrefix) || filePath.includes("..")) {
      throw new HomeworkError(403, "bad_path", "That file can't be used for this homework.");
    }

    const { data: blob, error: downloadError } = await storage.storage.from(WORKSHEET_BUCKET).download(filePath);
    if (downloadError || !blob) throw new HomeworkError(404, "no_file", "The uploaded file couldn't be found. Please upload it again.");

    let file;
    try {
      file = validateWorksheetBuffer(Buffer.from(await blob.arrayBuffer()), null, {
        label: "The uploaded file",
        maxBytes: MAX_LIBRARY_FILE_BYTES,
      });
    } catch (error) {
      // Don't keep files that failed content validation.
      await storage.storage.from(WORKSHEET_BUCKET).remove([filePath]);
      throw error;
    }

    const { error: markError } = await supabase
      .from("homework_sets")
      .update({
        original_file_path: filePath,
        original_file_type: file.mimeType,
        original_file_name: body.fileName?.trim().slice(0, 200) || set.original_file_name || "worksheet",
        extraction_status: "processing",
        extraction_error: null,
      })
      .eq("id", id);
    if (markError) dbError("markProcessing", markError);

    const startedAt = Date.now();
    try {
      const result = await extractHomework(file, set.subject);
      // Crop the pictures questions need and show them next to each question.
      await removeFigures(storage, set.created_by, id);
      const figures = await attachFigures(storage, set.created_by, id, file, result.sections, result.figures);
      await saveSetContent(userId, id, result.sections);
      await supabase.from("homework_sets").update({ extraction_status: "completed" }).eq("id", id);

      console.log("[library/extract] ok", { ...result.stats, figuresSaved: figures, bytes: file.bytes, ms: Date.now() - startedAt });
      const detail = await getSetDetailForEditor(supabase, viewer, id);
      return ok({ set: detail, suggestedTitle: result.suggestedTitle });
    } catch (error) {
      const message =
        error instanceof HomeworkError ? error.message : "Extraction failed. Please try again in a moment.";
      await supabase
        .from("homework_sets")
        .update({ extraction_status: "failed", extraction_error: message.slice(0, 500) })
        .eq("id", id);
      throw error;
    }
  }
);
