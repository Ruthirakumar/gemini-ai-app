import { NextRequest } from "next/server";
import { assertUuid, ok, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getVisibleSet } from "@/lib/library/repository";
import { WORKSHEET_BUCKET } from "@/lib/supabase/config";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

/** GET – short-lived signed URL for the original worksheet (owner, or anyone for a published shared set). */
export const GET = route(
  "library/file",
  async (_request: NextRequest, ctx: RouteContext<"/api/library/sets/[id]/file">) => {
    const id = assertUuid((await ctx.params).id, "homework");
    const { supabase } = await requireUser();
    // Visible = own homework, or a published shared set (RLS decides).
    const set = await getVisibleSet(supabase, id);
    if (!set.original_file_path) throw new HomeworkError(404, "no_file", "This homework has no uploaded file.");

    // Shared sets' files are in an admin's folder, so sign with the service role.
    const { data, error } = await createSupabaseAdminClient().storage
      .from(WORKSHEET_BUCKET)
      .createSignedUrl(set.original_file_path, 60 * 30);
    if (error || !data?.signedUrl) throw new HomeworkError(404, "no_file", "The original file couldn't be found.");

    return ok({ url: data.signedUrl, fileType: set.original_file_type, fileName: set.original_file_name });
  }
);
