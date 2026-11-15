import { HarmBlockThreshold, HarmCategory } from "@google/genai";
import { NextRequest } from "next/server";
import { assertUuid, ok, readJson, route } from "@/lib/api";
import { buildContents, FALLBACK_REPLY } from "@/lib/ask/conversation";
import { HomeworkError } from "@/lib/homework/errors";
import { gemini, GEMINI_MODEL, USER_ACTION_ATTEMPTS, withGeminiRetry } from "@/lib/gemini";
import { buildQuestionTutorInstruction, guardReply, questionAskSchema, type QuestionTutorContext } from "@/lib/learn/questionTutor";
import { getOwnedAttempt } from "@/lib/learn/repository";
import { dbError } from "@/lib/library/repository";
import { markingCriteriaSchema, questionDataSchema } from "@/lib/library/types";
import { createSupabaseAdminClient, requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE }));

interface QuestionRow {
  id: string;
  question_text: string;
  question_type: string;
  question_data: unknown;
  marking_criteria: unknown;
  homework_sections: { id: string; section_title: string; instructions: string | null; subject: string; homework_set_id: string };
}

/**
 * POST { questionId, message, history } – the child asks Buddy about one
 * question while practising. The server decides what Buddy may say: the
 * answer is only explained once the child has seen it.
 */
export const POST = route("learn/ask", async (request: NextRequest, ctx: RouteContext<"/api/learn/attempts/[id]/ask">) => {
  const id = assertUuid((await ctx.params).id, "attempt");
  const { supabase } = await requireUser();
  const { questionId, message, history } = await readJson(request, questionAskSchema);

  // Ownership via RLS.
  const attempt = await getOwnedAttempt(supabase, id);

  const admin = createSupabaseAdminClient();
  const { data: question, error } = await admin
    .from("questions")
    .select("id, question_text, question_type, question_data, marking_criteria, homework_sections!inner(id, section_title, instructions, subject, homework_set_id)")
    .eq("id", questionId)
    .eq("homework_sections.homework_set_id", attempt.homework_set_id)
    .maybeSingle<QuestionRow>();
  if (error) dbError("askQuestion", error);
  if (!question || (attempt.section_id && question.homework_sections.id !== attempt.section_id)) {
    throw new HomeworkError(404, "not_found", "That question couldn't be found. Please refresh the page.");
  }

  const { data: answer, error: answerError } = await admin
    .from("student_answers")
    .select("student_answer, locked, marking_status, hint, explanation, working_steps")
    .eq("attempt_id", id)
    .eq("question_id", questionId)
    .maybeSingle();
  if (answerError) dbError("askAnswer", answerError);

  const data = questionDataSchema.parse(question.question_data ?? {});
  const criteria = markingCriteriaSchema.parse(question.marking_criteria ?? {});
  const answerShown =
    attempt.status === "completed" || (!!answer?.locked && answer.marking_status !== "needs_review");

  const tutor: QuestionTutorContext = {
    subject: question.homework_sections.subject,
    sectionTitle: question.homework_sections.section_title,
    instructions: question.homework_sections.instructions,
    stem: data.parentText,
    questionText: question.question_text,
    studentAnswer: answer?.student_answer ?? null,
    answerShown,
    expectedAnswer: criteria.expectedAnswer,
    acceptableAnswers: criteria.acceptableAnswers,
    explanation: answerShown ? (answer?.explanation ?? null) : null,
    workingSteps: answerShown ? criteria.workingSteps : [],
    hint: answer?.hint ?? null,
  };

  const response = await withGeminiRetry(
    () =>
      gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: buildContents(history, message),
        config: {
          systemInstruction: buildQuestionTutorInstruction(tutor),
          temperature: 0.5,
          maxOutputTokens: 2048,
          safetySettings: SAFETY_SETTINGS,
        },
      }),
    { maxAttempts: USER_ACTION_ATTEMPTS, label: "Question tutor" }
  );

  const text = response.text?.trim();
  if (!text) console.warn("[learn/ask] empty reply", { finishReason: response.candidates?.[0]?.finishReason, blocked: response.promptFeedback?.blockReason });
  const reply = guardReply(text || FALLBACK_REPLY, tutor);
  console.log("[learn/ask]", { answerShown });
  return ok({ reply });
});
