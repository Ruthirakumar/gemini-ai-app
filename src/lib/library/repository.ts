import type { SupabaseClient } from "@supabase/supabase-js";
import { HomeworkError } from "@/lib/homework/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  EditorSection,
  HomeworkSetDetail,
  HomeworkSetSummary,
  markingCriteriaSchema,
  questionDataSchema,
  QuestionType,
  SectionSubject,
  SetStatus,
  SetSubject,
} from "./types";

export interface SetRow {
  id: string;
  school_year: number;
  week_number: number;
  title: string;
  subject: SetSubject;
  homework_date: string | null;
  original_file_path: string | null;
  original_file_type: string | null;
  original_file_name: string | null;
  status: SetStatus;
  extraction_status: HomeworkSetSummary["extractionStatus"];
  extraction_error: string | null;
  created_by: string;
  updated_at: string;
}

interface SectionWithQuestionFlags {
  id: string;
  questions: { id: string; needs_review: boolean; question_type: QuestionType }[];
}

export const SET_COLUMNS =
  "id, school_year, week_number, title, subject, homework_date, original_file_path, original_file_type, original_file_name, status, extraction_status, extraction_error, created_by, updated_at";

export function dbError(context: string, error: { message?: string; code?: string } | null): never {
  // supabase-js reports network failures with an empty code and "fetch failed".
  const network = !error?.code && /fetch failed|network|timed? ?out|ECONN|ETIMEDOUT/i.test(error?.message ?? "");
  // Postgres/PostgREST messages describe the query, not the child's answers, so they are safe to log.
  console.error(`[db] ${context}`, { code: error?.code || "(none)", message: error?.message?.slice(0, 200) });
  if (network) {
    throw new HomeworkError(503, "db_unreachable", "Homework Buddy can't reach its database right now. Please check your internet connection and try again.");
  }
  throw new HomeworkError(500, "db_error", "Something went wrong saving or loading homework. Please try again.");
}

export function toSummary(row: SetRow, sections: SectionWithQuestionFlags[] = []): HomeworkSetSummary {
  const questions = sections.flatMap((s) => s.questions);
  return {
    id: row.id,
    title: row.title,
    schoolYear: row.school_year,
    weekNumber: row.week_number,
    subject: row.subject,
    homeworkDate: row.homework_date,
    status: row.status,
    extractionStatus: row.extraction_status,
    extractionError: row.extraction_error,
    originalFileName: row.original_file_name,
    hasFile: Boolean(row.original_file_path),
    questionCount: questions.filter((q) => q.question_type !== "not_digital").length,
    needsReviewCount: questions.filter((q) => q.needs_review).length,
    updatedAt: row.updated_at,
  };
}

/** Loads a set the signed-in user owns (RLS enforces ownership). Throws 404 otherwise. */
export async function getOwnedSet(supabase: SupabaseClient, setId: string): Promise<SetRow> {
  const { data, error } = await supabase.from("homework_sets").select(SET_COLUMNS).eq("id", setId).maybeSingle();
  if (error) dbError("getOwnedSet", error);
  if (!data) throw new HomeworkError(404, "not_found", "That homework couldn't be found.");
  return data as SetRow;
}

export async function listSets(
  supabase: SupabaseClient,
  filters: { year?: number; week?: number; search?: string; status?: SetStatus }
): Promise<HomeworkSetSummary[]> {
  let query = supabase
    .from("homework_sets")
    .select(`${SET_COLUMNS}, homework_sections(id, questions(id, needs_review, question_type))`)
    .order("school_year", { ascending: true })
    .order("week_number", { ascending: false })
    .order("title", { ascending: true })
    .limit(200);

  if (filters.year) query = query.eq("school_year", filters.year);
  if (filters.week) query = query.eq("week_number", filters.week);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) {
    // Escape LIKE wildcards in user input.
    const term = filters.search.replace(/[\\%_]/g, (c) => `\\${c}`);
    query = query.ilike("title", `%${term}%`);
  }

  const { data, error } = await query;
  if (error) dbError("listSets", error);
  return (data ?? []).map((row) => {
    const { homework_sections, ...set } = row as SetRow & { homework_sections: SectionWithQuestionFlags[] };
    return toSummary(set as SetRow, homework_sections ?? []);
  });
}

/**
 * Full set content INCLUDING answer keys, for the admin review screen.
 * Ownership is verified with the user's client first; answer keys are then
 * read with the service role (they are not readable by signed-in users).
 */
export async function getSetDetailForOwner(supabase: SupabaseClient, setId: string): Promise<HomeworkSetDetail> {
  const set = await getOwnedSet(supabase, setId);
  const admin = createSupabaseAdminClient();

  const { data: sections, error } = await admin
    .from("homework_sections")
    .select(
      "id, subject, section_title, instructions, display_order, questions(id, question_number, question_text, question_type, question_data, marking_criteria, marks, display_order, needs_review)"
    )
    .eq("homework_set_id", setId)
    .order("display_order", { ascending: true })
    .order("display_order", { referencedTable: "questions", ascending: true });
  if (error) dbError("getSetDetail", error);

  const { count: attemptCount } = await supabase
    .from("homework_attempts")
    .select("id", { count: "exact", head: true })
    .eq("homework_set_id", setId);

  type Row = {
    id: string;
    subject: SectionSubject;
    section_title: string;
    instructions: string | null;
    questions: {
      id: string;
      question_number: string;
      question_text: string;
      question_type: QuestionType;
      question_data: unknown;
      marking_criteria: unknown;
      marks: number;
      needs_review: boolean;
    }[];
  };

  const editorSections: EditorSection[] = ((sections ?? []) as Row[]).map((s) => ({
    id: s.id,
    subject: s.subject,
    sectionTitle: s.section_title,
    instructions: s.instructions,
    questions: s.questions.map((q) => ({
      id: q.id,
      questionNumber: q.question_number,
      questionText: q.question_text,
      questionType: q.question_type,
      marks: q.marks,
      needsReview: q.needs_review,
      questionData: questionDataSchema.parse(q.question_data ?? {}),
      markingCriteria: markingCriteriaSchema.parse(q.marking_criteria ?? {}),
    })),
  }));

  const flags: SectionWithQuestionFlags[] = editorSections.map((s) => ({
    id: s.id ?? "",
    questions: s.questions.map((q) => ({ id: q.id ?? "", needs_review: q.needsReview, question_type: q.questionType })),
  }));

  return { ...toSummary(set, flags), sections: editorSections, attemptCount: attemptCount ?? 0 };
}

/** Atomically replaces a set's sections/questions (keeps ids of existing rows). */
export async function saveSetContent(userId: string, setId: string, sections: EditorSection[]): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("save_homework_content", {
    p_set_id: setId,
    p_owner: userId,
    p_sections: sections,
  });
  if (error) {
    if (error.code === "P0002") throw new HomeworkError(404, "not_found", "That homework couldn't be found.");
    dbError("saveSetContent", error);
  }
}
