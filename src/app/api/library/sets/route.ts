import { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api";
import { dbError, listSets, SET_COLUMNS, SetRow, toSummary } from "@/lib/library/repository";
import { SET_STATUSES, SetStatus, setMetadataSchema } from "@/lib/library/types";
import { requireUser } from "@/lib/supabase/server";

const toInt = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/** GET /api/library/sets?year=4&week=8&search=maths&status=published */
export const GET = route("library/list", async (request: NextRequest) => {
  const { supabase } = await requireUser();
  const params = request.nextUrl.searchParams;
  const status = params.get("status");
  const sets = await listSets(supabase, {
    year: toInt(params.get("year")),
    week: toInt(params.get("week")),
    search: params.get("search")?.trim().slice(0, 100) || undefined,
    status: (SET_STATUSES as readonly string[]).includes(status ?? "") ? (status as SetStatus) : undefined,
  });
  return ok({ sets });
});

/** POST /api/library/sets – creates a draft set (metadata only). */
export const POST = route("library/create", async (request: NextRequest) => {
  const { supabase, userId } = await requireUser();
  const meta = await readJson(request, setMetadataSchema);

  const { data, error } = await supabase
    .from("homework_sets")
    .insert({
      title: meta.title,
      school_year: meta.schoolYear,
      week_number: meta.weekNumber,
      subject: meta.subject,
      homework_date: meta.homeworkDate,
      status: "draft",
      created_by: userId,
    })
    .select(SET_COLUMNS)
    .single();
  if (error) dbError("createSet", error);

  const set = toSummary(data as SetRow);
  // The browser uploads the original file into this private folder.
  return ok({ set, uploadFolder: `${userId}/${set.id}` }, { status: 201 });
});
