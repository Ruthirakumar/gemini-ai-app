import { NextRequest } from "next/server";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { HomeworkError } from "@/lib/homework/errors";
import { getOwnedSet, getSetDetailForOwner, saveSetContent } from "@/lib/library/repository";
import { editorContentSchema } from "@/lib/library/types";
import { requireUser } from "@/lib/supabase/server";

/** PUT – saves the reviewed sections and questions (atomic). */
export const PUT = route(
  "library/content",
  async (request: NextRequest, ctx: RouteContext<"/api/library/sets/[id]/content">) => {
    const id = assertUuid((await ctx.params).id, "homework");
    const { supabase, userId } = await requireUser();
    const set = await getOwnedSet(supabase, id);
    const { sections } = await readJson(request, editorContentSchema);

    // Question numbers must be unique within each section.
    for (const section of sections) {
      const seen = new Set<string>();
      for (const q of section.questions) {
        const key = q.questionNumber.toLowerCase();
        if (seen.has(key)) {
          throw new HomeworkError(400, "duplicate_number", `"${section.sectionTitle}" has two questions numbered ${q.questionNumber}.`);
        }
        seen.add(key);
      }
    }

    const normalised = sections.map((section) => ({
      ...section,
      questions: section.questions.map((q) => ({
        ...q,
        marks: q.questionType === "not_digital" ? 0 : q.marks,
        questionData: {
          ...q.questionData,
          options: q.questionType === "multiple_choice" ? q.questionData.options.filter((o) => o.trim()) : [],
          reviewReason: q.needsReview ? q.questionData.reviewReason : null,
        },
      })),
    }));

    if (set.status === "published" && normalised.some((s) => s.questions.some((q) => q.needsReview))) {
      throw new HomeworkError(409, "needs_review", "Published homework can't have questions flagged for review. Unpublish it first.");
    }

    await saveSetContent(userId, id, normalised);
    const detail = await getSetDetailForOwner(supabase, id);
    return ok({ set: detail });
  }
);
