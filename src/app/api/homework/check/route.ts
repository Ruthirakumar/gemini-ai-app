import { NextRequest, NextResponse } from "next/server";
import { createPartFromBase64, createUserContent } from "@google/genai";
import { gemini, GEMINI_HOMEWORK_MODEL, withGeminiRetry } from "@/lib/gemini";
import { SUBJECT_OPTIONS, SubjectOption } from "@/lib/homework/constants";
import { HomeworkError, toErrorResponse } from "@/lib/homework/errors";
import { validateUploadedImages, ValidatedImage } from "@/lib/homework/image";
import { buildCheckUserPrompt, HOMEWORK_SYSTEM_PROMPT } from "@/lib/homework/prompts";
import type { HomeworkCheckResponse } from "@/lib/homework/types";
import {
  assertHasQuestions,
  buildHomeworkResult,
  homeworkResponseJsonSchema,
  InvalidModelResponseError,
  parseModelJson,
  validateHomeworkResponse,
} from "@/lib/homework/validation";

export const maxDuration = 180;

const GEMINI_TIMEOUT_MS = 90_000;

async function askGemini(images: ValidatedImage[], subject: SubjectOption) {
  const parts = [
    { text: buildCheckUserPrompt(subject, images.length) },
    ...images.flatMap((image, i) => [
      { text: `Page ${i + 1}:` },
      createPartFromBase64(image.base64, image.mimeType),
    ]),
  ];

  const response = await withGeminiRetry(
    () =>
      gemini.models.generateContent({
        model: GEMINI_HOMEWORK_MODEL,
        contents: createUserContent(parts),
        config: {
          systemInstruction: HOMEWORK_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseJsonSchema: homeworkResponseJsonSchema,
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      }),
    { maxAttempts: 2, label: "Homework check" }
  );

  return validateHomeworkResponse(parseModelJson(response.text));
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new HomeworkError(400, "bad_request", "Please upload your homework as a picture.");
    }

    const subjectValue = formData.get("subject") ?? "auto";
    if (typeof subjectValue !== "string" || !(SUBJECT_OPTIONS as readonly string[]).includes(subjectValue)) {
      throw new HomeworkError(400, "bad_subject", "Please choose English, Maths or Auto detect.");
    }
    const subject = subjectValue as SubjectOption;

    const images = await validateUploadedImages(formData.getAll("images"));

    // One extra attempt if Gemini returns malformed JSON; never more.
    let validated: Awaited<ReturnType<typeof askGemini>>;
    try {
      validated = await askGemini(images, subject);
    } catch (error) {
      if (!(error instanceof InvalidModelResponseError)) throw error;
      console.warn("[homework/check] invalid model response, retrying once");
      try {
        validated = await askGemini(images, subject);
      } catch (retryError) {
        if (retryError instanceof InvalidModelResponseError) {
          throw new HomeworkError(
            502,
            "invalid_ai_response",
            "Homework Buddy got muddled reading this worksheet. Please try again, or try a clearer photo."
          );
        }
        throw retryError;
      }
    }

    const result = buildHomeworkResult(validated.data, images.length);
    assertHasQuestions(result, validated.data.isHomework);

    // Log only non-sensitive metadata (no images, questions or answers).
    console.log("[homework/check] ok", {
      model: GEMINI_HOMEWORK_MODEL,
      subjectRequested: subject,
      subjectDetected: result.subject,
      images: images.length,
      totalBytes: images.reduce((sum, i) => sum + i.bytes, 0),
      questions: result.totalQuestions,
      needsReview: result.needsReviewCount,
      droppedQuestions: validated.dropped,
      ms: Date.now() - startedAt,
    });

    return NextResponse.json<HomeworkCheckResponse>({ success: true, result });
  } catch (error) {
    return toErrorResponse(error, "homework/check");
  }
}
