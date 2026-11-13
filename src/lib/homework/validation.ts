import { z } from "zod";
import { compareAnswers } from "./answerCompare";
import { HomeworkError } from "./errors";
import { sealPracticeToken } from "./practiceToken";
import {
  CheckedQuestion,
  geminiHomeworkSchema,
  geminiQuestionSchema,
  GeminiQuestion,
  HomeworkResult,
  Subject,
} from "./types";

const MAX_QUESTIONS = 60;
const MAX_TEXT = 1500;

/** JSON Schema sent to Gemini as responseJsonSchema (generated from the Zod schema). */
export const homeworkResponseJsonSchema = toGeminiJsonSchema(geminiHomeworkSchema);

export function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Extracts a JSON object from model text, tolerating stray code fences. */
export function parseModelJson(text: string | undefined): unknown {
  if (!text) throw new InvalidModelResponseError("empty response");
  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) body = fenced[1];
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new InvalidModelResponseError("response was not valid JSON");
  }
}

export class InvalidModelResponseError extends Error {
  constructor(reason: string) {
    super(`Invalid model response: ${reason}`);
    this.name = "InvalidModelResponseError";
  }
}

const clip = (s: string, max = MAX_TEXT) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
/** Child-facing text should talk to the child ("your answer"), not about them. */
const SECOND_PERSON: [RegExp, string][] = [
  [/\bthe student's\b/gi, "your"],
  [/\bthe student (has|is|was)\b/gi, "you $1"],
  [/\bthe student\b/gi, "you"],
];
export function toSecondPerson(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECOND_PERSON) out = out.replace(pattern, replacement);
  out = out.replace(/\byou has\b/gi, "you have").replace(/\byou is\b/gi, "you are").replace(/\byou was\b/gi, "you were");
  return out.replace(/(^|[.!?]\s+)([a-z])/g, (_, pre: string, ch: string) => pre + ch.toUpperCase());
}

/** For answers: trimmed only, never rewritten. */
const cleanText = (s: string | null | undefined): string | null => {
  if (s === null || s === undefined) return null;
  const trimmed = s.trim();
  return trimmed ? clip(trimmed) : null;
};
/** For feedback addressed to the child. */
const cleanFeedback = (s: string | null | undefined): string | null => {
  const text = cleanText(s);
  return text === null ? null : toSecondPerson(text);
};
const cleanList = (items: string[] | undefined, maxItems = 8, feedback = false) =>
  (items ?? [])
    .map((i) => i.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((i) => clip(feedback ? toSecondPerson(i) : i, 500));

/**
 * Validates the top-level shape strictly, but validates questions one by one so
 * a single malformed question doesn't throw away the whole worksheet.
 */
export function validateHomeworkResponse(raw: unknown) {
  const topLevel = geminiHomeworkSchema
    .extend({ questions: z.array(z.unknown()) })
    .safeParse(raw);
  if (!topLevel.success) {
    throw new InvalidModelResponseError("top-level shape mismatch");
  }

  const questions: GeminiQuestion[] = [];
  let dropped = 0;
  for (const item of topLevel.data.questions.slice(0, MAX_QUESTIONS)) {
    const parsed = geminiQuestionSchema.safeParse(item);
    if (parsed.success) questions.push(parsed.data);
    else dropped++;
  }

  return { data: { ...topLevel.data, questions }, dropped };
}

const REVIEW_CONFLICT =
  "I'm not completely sure how to mark this one. Please check it with your teacher or a grown-up.";

/**
 * Applies the marking safety rules and converts a single Gemini question into
 * the public shape. Practice answers are sealed into an encrypted token.
 */
export function normaliseQuestion(
  q: GeminiQuestion,
  index: number,
  subject: Subject,
  pageCount: number
): CheckedQuestion {
  const studentAnswer = cleanText(q.studentAnswer);
  const correctAnswer = cleanText(q.correctAnswer);
  let status = q.status;
  let explanation = cleanFeedback(q.explanation) ?? "";
  let reviewReason = cleanFeedback(q.reviewReason);

  const toReview = (reason: string) => {
    status = "needs_review";
    reviewReason = reviewReason ?? reason;
  };

  // Rule: never confidently mark something that couldn't be read.
  if (status !== "needs_review") {
    if (q.readingConfidence === "low") {
      toReview("Part of this question or answer is hard to read. Please check it or take a clearer photo.");
    } else if (studentAnswer === null) {
      toReview("I couldn't find an answer for this question. Did you mean to leave it blank?");
    } else if (correctAnswer === null) {
      toReview("I couldn't work out the expected answer for this question.");
    }
  }

  // Rule: cross-check Gemini's verdict against its own answers.
  if (status !== "needs_review" && studentAnswer && correctAnswer) {
    const numeric = subject === "Maths";
    // English can test capitals/punctuation, so only an exact match counts there.
    const comparison = numeric
      ? compareAnswers(studentAnswer, correctAnswer, [], { numeric })
      : studentAnswer === correctAnswer
        ? "match"
        : "unknown";
    if (status === "incorrect" && comparison === "match") {
      // Student's answer is identical to the expected answer, yet marked wrong.
      toReview(REVIEW_CONFLICT);
      explanation = REVIEW_CONFLICT;
    } else if (status === "correct" && numeric && comparison === "mismatch") {
      // Two different numbers, yet marked right.
      toReview(REVIEW_CONFLICT);
      explanation = REVIEW_CONFLICT;
    }
  }

  if (status === "needs_review" && !explanation) {
    explanation = "I need a bit of help reading this one.";
  }
  if (!explanation) {
    explanation = status === "correct" ? "Well done - that's right!" : "Good try! Let's look at this one together.";
  }

  let practiceQuestion: CheckedQuestion["practiceQuestion"] = null;
  if (status === "incorrect" && q.practiceQuestion) {
    const p = q.practiceQuestion;
    const expected = cleanText(p.expectedAnswer);
    const question = cleanText(p.question);
    if (expected && question) {
      practiceQuestion = {
        question,
        token: sealPracticeToken({
          subject,
          topic: clip(q.topic.trim(), 100),
          originalQuestion: clip(q.question.trim(), 500),
          question,
          expectedAnswer: clip(expected, 200),
          acceptableAnswers: cleanList(p.acceptableAnswers, 10).map((a) => clip(a, 200)),
          answerType: p.answerType,
          hint: cleanFeedback(p.hint) ?? "Read the question slowly and think about what it is asking you to do.",
          solutionSteps: cleanList(p.solutionSteps, 8, true),
        }),
      };
    }
  }

  const isIncorrect = status === "incorrect";
  const isReview = status === "needs_review";

  return {
    id: `q-${index + 1}`,
    questionNumber: clip(q.questionNumber.trim() || String(index + 1), 20),
    page: Math.min(Math.max(1, q.page || 1), pageCount),
    questionType: q.questionType,
    topic: clip(q.topic.trim(), 100),
    question: clip(q.question.trim() || "(question text not readable)"),
    studentAnswer,
    // Hide a confident "correct answer" when we're unsure what's being asked.
    correctAnswer: isReview && q.readingConfidence === "low" ? null : correctAnswer,
    status,
    explanation,
    whatWentWrong: isIncorrect ? cleanFeedback(q.whatWentWrong) : null,
    working: isReview ? [] : cleanList(q.working, 8, true),
    reviewReason: isReview ? reviewReason : null,
    practiceQuestion,
  };
}

/** Builds the final result. Totals are always recalculated from validated statuses. */
export function buildHomeworkResult(
  data: ReturnType<typeof validateHomeworkResponse>["data"],
  pageCount: number
): HomeworkResult {
  const subject: Subject = data.detectedSubject;
  const questions = data.questions.map((q, i) => normaliseQuestion(q, i, subject, pageCount));

  const correctCount = questions.filter((q) => q.status === "correct").length;
  const incorrectCount = questions.filter((q) => q.status === "incorrect").length;
  const needsReviewCount = questions.filter((q) => q.status === "needs_review").length;
  const totalQuestions = questions.length;
  const marked = correctCount + incorrectCount;
  const scorePercentage = marked > 0 ? Math.round((correctCount / marked) * 100) : null;

  return {
    subject,
    worksheetTitle: cleanText(data.worksheetTitle),
    summary: buildSummary(correctCount, marked, needsReviewCount),
    encouragement: cleanFeedback(data.encouragement) ?? "Thank you for sharing your homework with me!",
    imageQualityNotes: cleanFeedback(data.imageQualityNotes),
    totalQuestions,
    correctCount,
    incorrectCount,
    needsReviewCount,
    scorePercentage,
    questions,
  };
}

function buildSummary(correct: number, marked: number, review: number): string {
  const reviewText =
    review === 0 ? "" : ` ${review} ${review === 1 ? "question needs" : "questions need"} a second look.`;

  if (marked === 0) {
    return `I couldn't mark any questions confidently.${reviewText}`;
  }
  const opener =
    correct === marked ? "Amazing work!" : correct / marked >= 0.7 ? "Great effort!" : correct / marked >= 0.4 ? "Good effort!" : "Good try!";
  return `${opener} You got ${correct} out of ${marked} correct.${reviewText}`;
}

export function assertHasQuestions(result: HomeworkResult, isHomework: boolean) {
  if (!isHomework) {
    throw new HomeworkError(
      422,
      "not_homework",
      "Hmm, this picture doesn't look like a homework worksheet. Please take a photo of your English or Maths homework."
    );
  }
  if (result.totalQuestions === 0) {
    throw new HomeworkError(
      422,
      "no_questions",
      "I couldn't find any questions in this picture. Please make sure the whole worksheet is in the photo and it's not blurry."
    );
  }
}
