import { NextRequest } from "next/server";
import { ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { toStudent } from "@/lib/learn/repository";
import { studentInputSchema } from "@/lib/learn/types";
import { dbError } from "@/lib/library/repository";
import { requireUser } from "@/lib/supabase/server";

const MAX_STUDENTS = 10;

/** GET – the signed-in parent's child profiles. */
export const GET = route("students/list", async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("students")
    .select("id, display_name, school_year")
    .order("created_at", { ascending: true });
  if (error) dbError("listStudents", error);
  return ok({ students: (data ?? []).map(toStudent) });
});

/** POST – adds a child profile. */
export const POST = route("students/create", async (request: NextRequest) => {
  const { supabase, userId } = await requireUser();
  const input = await readJson(request, studentInputSchema);

  const { count } = await supabase.from("students").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_STUDENTS) {
    throw new HomeworkError(400, "too_many_students", `You can add up to ${MAX_STUDENTS} children.`);
  }

  const { data, error } = await supabase
    .from("students")
    .insert({ display_name: input.displayName, school_year: input.schoolYear, parent_id: userId })
    .select("id, display_name, school_year")
    .single();
  if (error) dbError("createStudent", error);
  return ok({ student: toStudent(data) }, { status: 201 });
});
