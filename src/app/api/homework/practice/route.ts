import { NextRequest, NextResponse } from "next/server";
import { gemini, GEMINI_MODEL, withGeminiRetry } from "@/lib/gemini";
import { compareAnswers, normaliseText } from "@/lib/homework/answerCompare";
import { MAX_PRACTICE_ATTEMPTS } from "@/lib/homework/constants";
import { HomeworkError, toErrorResponse } from "@/lib/homework/errors";
import { openPracticeToken } from "@/lib/homework/practiceToken";
import { buildPracticeJudgePrompt, PRACTICE_SYSTEM_PROMPT } from "@/lib/homework/prompts";
import {
  geminiPracticeJudgementSchema,
  GeminiPracticeJudgement,
  PracticeResponse,
  practiceRequestSchema,
  PracticeTokenPayload,
} from "@/lib/homework/types";
import { parseModelJson, toGeminiJsonSchema } from "@/lib/homework/validation";

export const maxDuration = 60;

const judgementJsonSchema = toGeminiJsonSchema(geminiPracticeJudgementSchema);

const PRAISE = [
  "Brilliant! You got it right!",
  "Yes! That's exactly right. Great thinking!",
  "Fantastic work - you've cracked it!",
  "Spot on! You should be proud of yourself.",
];

const praise = (attempt: number) => PRAISE[(attempt - 1) % PRAISE.length];

/** True if a hint/feedback would give away the answer. */
function leaksAnswer(text: string | null, payload: PracticeTokenPayload): boolean {
  if (!text) return false;
  const haystack = ` ${normaliseText(text).replace(/[^a-z0-9./ ]/g, " ")} `;
  return [payload.expectedAnswer, ...payload.acceptableAnswers].some((answer) => {
    const needle = normaliseText(answer).replace(/[^a-z0-9./ ]/g, " ").trim();
    return needle.length > 0 && haystack.includes(` ${needle} `);
  });
}

/** Fallback hints if Gemini is unavailable, getting more concrete each attempt. */
function fallbackHint(payload: PracticeTokenPayload, attempt: number): string {
  if (attempt <= 1) return payload.hint;
  const firstStep = payload.solutionSteps[0];
  return firstStep && !leaksAnswer(firstStep, payload)
    ? `Let's start together: ${firstStep}`
    : `${payload.hint} Take it one small step at a time.`;
}

async function judgeWithGemini(
  payload: PracticeTokenPayload,
  answer: string,
  attempt: number
): Promise<GeminiPracticeJudgement | null> {
  try {
    const response = await withGeminiRetry(
      () =>
        gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: buildPracticeJudgePrompt(payload, answer, attempt, [payload.hint]),
          config: {
            systemInstruction: PRACTICE_SYSTEM_PROMPT,
            responseMimeType: "application/json",
            responseJsonSchema: judgementJsonSchema,
            abortSignal: AbortSignal.timeout(30_000),
          },
        }),
      { maxAttempts: 2, label: "Practice judge" }
    );
    const parsed = geminiPracticeJudgementSchema.safeParse(parseModelJson(response.text));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn("[homework/practice] Gemini judge unavailable, using fallback", {
      name: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

function revealed(payload: PracticeTokenPayload, feedback: string): PracticeResponse {
  return {
    success: true,
    outcome: "revealed",
    feedback,
    hint: null,
    correctAnswer: payload.expectedAnswer,
    solutionSteps: payload.solutionSteps,
    attemptsLeft: 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new HomeworkError(400, "bad_request", "Something went wrong sending your answer. Please try again.");
    }

    const parsed = practiceRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new HomeworkError(400, "bad_request", "Please type an answer before checking.");
    }
    const { token, answer: rawAnswer, attempt, reveal } = parsed.data;

    const payload = openPracticeToken(token);
    if (!payload) {
      throw new HomeworkError(
        410,
        "practice_expired",
        "This practice question has expired. Please check your homework again to get a fresh one."
      );
    }

    if (reveal) {
      return NextResponse.json<PracticeResponse>(
        revealed(payload, "No problem! Here's how to solve it, step by step.")
      );
    }

    const answer = rawAnswer.trim();
    if (!answer) {
      throw new HomeworkError(400, "empty_answer", "Please type your answer first.");
    }

    // 1. Deterministic check first (fast, no AI call, can't be fooled).
    const deterministic = compareAnswers(answer, payload.expectedAnswer, payload.acceptableAnswers, {
      numeric: payload.answerType === "number",
    });

    let isCorrect: boolean;
    let feedback: string;
    let hint: string | null = null;

    if (deterministic === "match") {
      isCorrect = true;
      feedback = praise(attempt);
    } else {
      // 2. Gemini judges meaning (English) and writes an adaptive hint.
      const judgement = await judgeWithGemini(payload, answer, attempt);
      // A definite numeric mismatch can't be overruled by the model.
      isCorrect = deterministic === "mismatch" ? false : judgement?.isCorrect ?? false;

      if (isCorrect) {
        feedback = judgement?.feedback || praise(attempt);
      } else {
        feedback =
          judgement && !judgement.isCorrect && !leaksAnswer(judgement.feedback, payload)
            ? judgement.feedback
            : "Not quite - but you're getting there! Have another go.";
        hint =
          judgement?.hint && !leaksAnswer(judgement.hint, payload)
            ? judgement.hint
            : fallbackHint(payload, attempt);
      }

      if (!judgement && deterministic === "unknown") {
        // Without the model we can't judge a free-text answer fairly.
        feedback = "I couldn't check that answer just now, so here's a hint to compare with.";
      }
    }

    console.log("[homework/practice]", { attempt, method: deterministic === "match" ? "deterministic" : "gemini", isCorrect });

    if (isCorrect) {
      return NextResponse.json<PracticeResponse>({
        success: true,
        outcome: "correct",
        feedback,
        hint: null,
        correctAnswer: payload.expectedAnswer,
        solutionSteps: payload.solutionSteps,
        attemptsLeft: 0,
      });
    }

    if (attempt >= MAX_PRACTICE_ATTEMPTS) {
      return NextResponse.json<PracticeResponse>(
        revealed(payload, "That was a tricky one, and you kept trying - well done! Let's look at the answer together.")
      );
    }

    return NextResponse.json<PracticeResponse>({
      success: true,
      outcome: "try_again",
      feedback,
      hint,
      correctAnswer: null,
      solutionSteps: [],
      attemptsLeft: MAX_PRACTICE_ATTEMPTS - attempt,
    });
  } catch (error) {
    return toErrorResponse(error, "homework/practice");
  }
}
