import { NextRequest } from "next/server";
import { z } from "zod";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { gemini, GEMINI_MODEL, withGeminiRetry } from "@/lib/gemini";
import { HomeworkError } from "@/lib/homework/errors";
import { sealPracticeToken } from "@/lib/homework/practiceToken";
import { geminiPracticeSchema } from "@/lib/homework/types";
import { parseModelJson, toGeminiJsonSchema } from "@/lib/homework/validation";
import { getOwnedAttempt, loadMarkableQuestions } from "@/lib/learn/repository";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

const bodySchema = z.object({ questionId: z.uuid() });
const practiceJsonSchema = toGeminiJsonSchema(geminiPracticeSchema);

const SIMILAR_PROMPT = `
You write ONE practice question for a UK primary school child (Years 3-4) who got a homework question wrong.
Rules:
- Same subject and the same learning objective/skill as the original.
- Similar difficulty. Different numbers or different words - never the same question reworded, and the answer must differ from the original answer.
- It must be answerable by typing a short answer, with one clear correct answer.
- Self-contained: include any data, word list or short passage needed (the child can't see diagrams).
- hint: a gentle hint that does not reveal the answer. solutionSteps: 2-5 child-friendly steps.
- UK English and UK school methods. Return ONLY JSON matching the schema.
`.trim();

/**
 * POST – generates a similar practice question for a marked question.
 * The expected answer is sealed in an encrypted token; the browser answers it
 * through the existing /api/homework/practice tutor endpoint.
 */
export const POST = route(
  "learn/similar",
  async (request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]/similar">) => {
    const id = assertUuid((await ctx.params).id, "attempt");
    const { supabase } = await requireUser();
    const { questionId } = await readJson(request, bodySchema);

    const attempt = await getOwnedAttempt(supabase, id);
    if (attempt.status !== "completed") {
      throw new HomeworkError(409, "not_marked", "Hand in your homework first, then you can practise.");
    }

    const admin = createSupabaseAdminClient();
    const questions = await loadMarkableQuestions(admin, attempt.homework_set_id, attempt.section_id);
    const question = questions.find((q) => q.id === questionId);
    if (!question || question.type === "not_digital") {
      throw new HomeworkError(404, "not_found", "That question couldn't be found.");
    }

    const response = await withGeminiRetry(
      () =>
        gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: JSON.stringify({
            subject: question.subject,
            topic: question.data.topic,
            sharedStem: question.data.parentText,
            originalQuestion: question.text,
            originalAnswer: question.criteria.expectedAnswer,
            answerFormat: question.type === "number" ? "number" : "short text",
          }),
          config: {
            systemInstruction: SIMILAR_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: practiceJsonSchema,
            abortSignal: AbortSignal.timeout(45_000),
          },
        }),
      { maxAttempts: 2, label: "Similar question" }
    );

    const parsed = geminiPracticeSchema.safeParse(parseModelJson(response.text));
    if (!parsed.success || !parsed.data.question.trim() || !parsed.data.expectedAnswer.trim()) {
      throw new HomeworkError(502, "invalid_ai_response", "I couldn't think of a good practice question just now. Please try again.");
    }
    const p = parsed.data;

    const token = sealPracticeToken({
      subject: question.subject,
      topic: question.data.topic.slice(0, 100),
      originalQuestion: question.text.slice(0, 500),
      question: p.question.trim().slice(0, 1500),
      expectedAnswer: p.expectedAnswer.trim().slice(0, 200),
      acceptableAnswers: p.acceptableAnswers.map((a) => a.trim().slice(0, 200)).filter(Boolean).slice(0, 10),
      answerType: p.answerType,
      hint: p.hint.trim().slice(0, 500) || "Read the question slowly and think about what it is asking.",
      solutionSteps: p.solutionSteps.map((s) => s.trim().slice(0, 500)).filter(Boolean).slice(0, 8),
    });

    return ok({ practice: { question: p.question.trim().slice(0, 1500), token } });
  }
);
