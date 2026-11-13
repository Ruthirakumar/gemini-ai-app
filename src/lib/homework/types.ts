import { z } from "zod";

/* ------------------------------------------------------------------ */
/* 1. Schema of the raw JSON Gemini must return for homework checking  */
/*    (also converted to JSON Schema and sent to Gemini as the         */
/*    responseJsonSchema, so there is a single source of truth).       */
/* ------------------------------------------------------------------ */

export const QUESTION_STATUSES = ["correct", "incorrect", "needs_review"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_TYPES = [
  "calculation",
  "word_problem",
  "multiple_choice",
  "fill_in_the_blank",
  "true_false",
  "matching",
  "short_answer",
  "comprehension",
  "spelling",
  "grammar",
  "punctuation",
  "sentence_writing",
  "other",
] as const;

const nullableText = z.string().nullable();

export const geminiPracticeSchema = z.object({
  question: z.string().describe("A new, similar question at the same difficulty. Must not be identical to the original."),
  expectedAnswer: z.string().describe("The single best correct answer, as short as possible (e.g. '30' or 'quickly')."),
  acceptableAnswers: z.array(z.string()).describe("Other genuinely correct forms of the answer, e.g. '0.5' for '1/2'. Can be empty."),
  answerType: z.enum(["number", "text"]).describe("'number' if the answer is purely numeric (whole number, decimal or fraction, optionally with a unit), otherwise 'text'."),
  hint: z.string().describe("A gentle first hint that does NOT contain the answer."),
  solutionSteps: z.array(z.string()).describe("Child-friendly step-by-step working that reaches the answer."),
});

export const geminiQuestionSchema = z.object({
  questionNumber: z.string().describe("The numbering exactly as printed on the worksheet, e.g. '1', '2b', 'Q3'. If unnumbered, number in reading order."),
  page: z.number().int().describe("Which uploaded image the question is on, starting at 1."),
  questionType: z.enum(QUESTION_TYPES),
  topic: z.string().describe("Short skill name, e.g. 'Division', 'Fractions', 'Past tense verbs', 'Inference'."),
  question: z.string().describe("The question as written. For unreadable questions describe where it is on the page."),
  studentAnswer: nullableText.describe("Exactly what the student wrote, or null if blank or unreadable. Never guess."),
  correctAnswer: nullableText.describe("The expected correct answer, or null if the question itself cannot be read."),
  status: z.enum(QUESTION_STATUSES),
  readingConfidence: z.enum(["high", "medium", "low"]).describe("How confidently the question AND the student's answer could be read."),
  explanation: z.string().describe("Child-friendly feedback addressed to the student."),
  whatWentWrong: nullableText.describe("For incorrect answers: the specific mistake, kindly worded. Otherwise null."),
  working: z.array(z.string()).describe("Step-by-step working for incorrect answers (and calculations). Empty array if not needed."),
  reviewReason: nullableText.describe("For needs_review: which part of the image is unclear and what to check. Otherwise null."),
  practiceQuestion: geminiPracticeSchema.nullable().describe("Required for incorrect answers. null otherwise."),
});

export const geminiHomeworkSchema = z.object({
  isHomework: z.boolean().describe("false if the images do not show a worksheet or homework at all."),
  detectedSubject: z.enum(["English", "Maths", "Other"]),
  worksheetTitle: nullableText,
  encouragement: z.string().describe("One or two warm sentences for the student. Do NOT mention scores or numbers of questions."),
  imageQualityNotes: nullableText.describe("Any problems with the photo (blur, cropping, glare), or null."),
  questions: z.array(geminiQuestionSchema),
});

export type GeminiHomework = z.infer<typeof geminiHomeworkSchema>;
export type GeminiQuestion = z.infer<typeof geminiQuestionSchema>;
export type GeminiPractice = z.infer<typeof geminiPracticeSchema>;

/* ------------------------------------------------------------------ */
/* 2. Public types returned to the browser (no practice answers!)      */
/* ------------------------------------------------------------------ */

export type Subject = "English" | "Maths" | "Other";

export interface PublicPracticeQuestion {
  question: string;
  /** Opaque, encrypted token. Holds the expected answer server-side only. */
  token: string;
}

export interface CheckedQuestion {
  id: string;
  questionNumber: string;
  page: number;
  questionType: (typeof QUESTION_TYPES)[number];
  topic: string;
  question: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  status: QuestionStatus;
  explanation: string;
  whatWentWrong: string | null;
  working: string[];
  reviewReason: string | null;
  practiceQuestion: PublicPracticeQuestion | null;
}

export interface HomeworkResult {
  subject: Subject;
  worksheetTitle: string | null;
  summary: string;
  encouragement: string;
  imageQualityNotes: string | null;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  needsReviewCount: number;
  /** Percentage of the questions that could be marked (correct + incorrect). null if none. */
  scorePercentage: number | null;
  questions: CheckedQuestion[];
}

export interface HomeworkCheckResponse {
  success: true;
  result: HomeworkResult;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  code: string;
}

/* ------------------------------------------------------------------ */
/* 3. Practice mode                                                    */
/* ------------------------------------------------------------------ */

/** Contents of the encrypted practice token. Never sent to the browser in clear text. */
export interface PracticeTokenPayload {
  v: 1;
  subject: Subject;
  topic: string;
  originalQuestion: string;
  question: string;
  expectedAnswer: string;
  acceptableAnswers: string[];
  answerType: "number" | "text";
  hint: string;
  solutionSteps: string[];
  issuedAt: number;
}

export const practiceRequestSchema = z.object({
  token: z.string().min(10).max(8000),
  answer: z.string().max(300).optional().default(""),
  attempt: z.number().int().min(1).max(10),
  reveal: z.boolean().optional().default(false),
});

export type PracticeOutcome = "correct" | "try_again" | "revealed";

export interface PracticeResponse {
  success: true;
  outcome: PracticeOutcome;
  feedback: string;
  hint: string | null;
  /** Only present once the student is correct or the answer is revealed. */
  correctAnswer: string | null;
  solutionSteps: string[];
  attemptsLeft: number;
}

/** Gemini's verdict on a practice answer. */
export const geminiPracticeJudgementSchema = z.object({
  isCorrect: z.boolean(),
  feedback: z.string().describe("One or two short, encouraging sentences to the student. If wrong, must NOT reveal the answer."),
  hint: nullableText.describe("If wrong: a hint that does not reveal the answer, simpler than previous hints. null if correct."),
});

export type GeminiPracticeJudgement = z.infer<typeof geminiPracticeJudgementSchema>;
