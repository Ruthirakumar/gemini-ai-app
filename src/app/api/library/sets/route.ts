import { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { dbError, listSets, SET_COLUMNS, SetRow, toSummary } from "@/lib/library/repository";
import { SET_STATUSES, SetStatus, setMetadataSchema } from "@/lib/library/types";
import { requireViewer } from "@/lib/supabase/server";

const toInt = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * GET /api/library/sets?scope=mine|shared&year=4&week=8&topic=Fractions&search=…&status=published
 * mine (default): the parent's own homework. shared: the shared library (admins see drafts too).
 */
export const GET = route("library/list", async (request: NextRequest) => {
  const { supabase, userId, isAdmin } = await requireViewer();
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const visibility = params.get("scope") === "shared" ? "shared" : "private";
  const sets = await listSets(supabase, { userId, isAdmin }, {
    visibility,
    year: toInt(params.get("year")),
    week: toInt(params.get("week")),
    topic: params.get("topic")?.trim().slice(0, 100) || undefined,
    search: params.get("search")?.trim().slice(0, 100) || undefined,
    status: (SET_STATUSES as readonly string[]).includes(status ?? "") ? (status as SetStatus) : undefined,
  });
  return ok({ sets, isAdmin });
});

/** POST /api/library/sets – creates a draft (private homework, or a shared set for admins). */
export const POST = route("library/create", async (request: NextRequest) => {
  const { supabase, userId, isAdmin } = await requireViewer();
  const meta = await readJson(request, setMetadataSchema);
  if (meta.visibility === "shared" && !isAdmin) {
    throw new HomeworkError(403, "not_allowed", "Only an admin can add to the shared library.");
  }

  const { data, error } = await supabase
    .from("homework_sets")
    .insert({
      title: meta.title,
      school_year: meta.schoolYear,
      week_number: meta.visibility === "shared" ? null : meta.weekNumber,
      topic: meta.visibility === "shared" ? meta.topic?.trim() : null,
      visibility: meta.visibility,
      subject: meta.subject,
      homework_date: meta.homeworkDate,
      status: "draft",
      created_by: userId,
    })
    .select(SET_COLUMNS)
    .single();
  if (error) dbError("createSet", error);

  const set = toSummary(data as SetRow, { userId, isAdmin });
  // The browser uploads the original file into this private folder.
  return ok({ set, uploadFolder: `${userId}/${set.id}` }, { status: 201 });
});
