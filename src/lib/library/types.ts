import { z } from "zod";

// Shared by client and server. No server-only imports.

export const SCHOOL_YEARS = [1, 2, 3, 4, 5, 6] as const;
export const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);
export const SET_SUBJECTS = ["English", "Maths", "Both"] as const;
export const SECTION_SUBJECTS = ["English", "Maths"] as const;
export const SET_STATUSES = ["draft", "published", "archived"] as const;

export type SetSubject = (typeof SET_SUBJECTS)[number];
export type SectionSubject = (typeof SECTION_SUBJECTS)[number];
export type SetStatus = (typeof SET_STATUSES)[number];

/**
 * How the student answers in practice mode.
 * - not_digital: must be done on paper (drawing, colouring, learning a list).
 *   Shown for information, never marked.
 */
export const QUESTION_TYPES = ["short_text", "long_text", "number", "multiple_choice", "not_digital"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short answer",
  long_text: "Sentence / explanation",
  number: "Number",
  multiple_choice: "Multiple choice",
  not_digital: "On paper only",
};

/* ------------------------------------------------------------------ */
/* Question content (stored in questions.question_data – visible to    */
/* students) and the answer key (questions.marking_criteria – server   */
/* only).                                                              */
/* ------------------------------------------------------------------ */

export const questionDataSchema = z.object({
  topic: z.string().max(100).default(""),
  /** Page of the original document the question is on (1-based), for diagrams. */
  page: z.number().int().min(1).max(500).nullable().default(null),
  /** Shared stem for subparts, e.g. "Using the refreshments price list, how much will it cost for:" */
  parentNumber: z.string().max(20).nullable().default(null),
  parentText: z.string().max(2000).nullable().default(null),
  options: z.array(z.string().max(200)).max(20).default([]),
  /** For multiple choice: how many options to pick (e.g. "underline two words"). */
  selectCount: z.number().int().min(1).max(5).default(1),
  /** Unit shown after the answer box, e.g. "p", "cm". */
  unit: z.string().max(20).nullable().default(null),
  /** Where to look on the original sheet for a diagram/table. Must not give the answer away. */
  visualReference: z.string().max(500).nullable().default(null),
  reviewReason: z.string().max(500).nullable().default(null),
  /** Cropped picture for this question, in private storage ("<user>/<set>/figures/<n>.png"). */
  figurePath: z.string().max(400).nullable().default(null),
});
export type QuestionData = z.infer<typeof questionDataSchema>;

export const markingCriteriaSchema = z.object({
  expectedAnswer: z.string().max(1000).default(""),
  acceptableAnswers: z.array(z.string().max(500)).max(20).default([]),
  /** Free-text guidance, including how to award partial marks. */
  criteria: z.string().max(2000).default(""),
  workingSteps: z.array(z.string().max(500)).max(10).default([]),
});
export type MarkingCriteria = z.infer<typeof markingCriteriaSchema>;

/* ------------------------------------------------------------------ */
/* Editor payload (admin review screen <-> API)                        */
/* ------------------------------------------------------------------ */

export const editorQuestionSchema = z.object({
  id: z.uuid().nullable(),
  questionNumber: z.string().trim().min(1, "Every question needs a number").max(20),
  questionText: z.string().trim().min(1, "Every question needs some text").max(4000),
  questionType: z.enum(QUESTION_TYPES),
  marks: z.number().int().min(0).max(20),
  needsReview: z.boolean(),
  questionData: questionDataSchema,
  markingCriteria: markingCriteriaSchema,
});
export type EditorQuestion = z.infer<typeof editorQuestionSchema>;

export const editorSectionSchema = z.object({
  id: z.uuid().nullable(),
  subject: z.enum(SECTION_SUBJECTS),
  sectionTitle: z.string().trim().min(1, "Every section needs a title").max(200),
  instructions: z.string().max(2000).nullable(),
  questions: z.array(editorQuestionSchema).max(300),
});
export type EditorSection = z.infer<typeof editorSectionSchema>;

export const editorContentSchema = z.object({
  sections: z.array(editorSectionSchema).max(50),
});

export const SET_VISIBILITIES = ["private", "shared"] as const;
export type SetVisibility = (typeof SET_VISIBILITIES)[number];

/** Fields of a set. Private homework needs a week; shared library sets need a topic. */
export const setFieldsSchema = z.object({
  title: z.string().trim().min(1, "Please enter a title").max(200),
  schoolYear: z.number().int().min(1).max(13),
  weekNumber: z.number().int().min(1).max(52).nullable().default(null),
  subject: z.enum(SET_SUBJECTS),
  homeworkDate: z.iso.date().nullable().default(null),
  visibility: z.enum(SET_VISIBILITIES).default("private"),
  topic: z.string().trim().max(100).nullable().default(null),
});

export const setMetadataSchema = setFieldsSchema
  .refine((m) => m.visibility === "shared" || m.weekNumber !== null, { message: "Please choose a week", path: ["weekNumber"] })
  .refine((m) => m.visibility === "private" || !!m.topic?.trim(), { message: "Please enter a topic", path: ["topic"] });
export type SetMetadata = z.infer<typeof setMetadataSchema>;

export interface HomeworkSetSummary {
  id: string;
  title: string;
  schoolYear: number;
  weekNumber: number | null;
  subject: SetSubject;
  homeworkDate: string | null;
  visibility: SetVisibility;
  topic: string | null;
  /** Whether the signed-in user may edit it (owner, or admin for shared sets). */
  canEdit: boolean;
  /** Whether the signed-in user created it (only the creator can share / unshare). */
  isMine: boolean;
  status: SetStatus;
  extractionStatus: "pending" | "processing" | "completed" | "failed";
  extractionError: string | null;
  originalFileName: string | null;
  hasFile: boolean;
  questionCount: number;
  sectionCount: number;
  needsReviewCount: number;
  updatedAt: string;
}

export interface HomeworkSetDetail extends HomeworkSetSummary {
  sections: EditorSection[];
  attemptCount: number;
  /** Short-lived signed URLs for questionData.figurePath values. */
  figureUrls: Record<string, string>;
  /** Whether the person viewing is an admin (can share their own homework). */
  viewerIsAdmin: boolean;
}

/* ------------------------------------------------------------------ */
/* Gemini extraction output                                            */
/* ------------------------------------------------------------------ */

export const extractedQuestionSchema = z.object({
  questionNumber: z.string().describe("Main number plus a letter for sub-questions, e.g. '5a', '9b', '15q'; just the number for single questions."),
  page: z.number().int().describe("Page of the document this question is on, starting at 1."),
  parentNumber: z.string().nullable().describe("For subparts, the main question number (e.g. '9'). null otherwise."),
  parentText: z.string().nullable().describe("For subparts: the shared question stem/data they all use (price list, word box, passage). null otherwise."),
  questionText: z.string().describe("The full text of this specific answerable item, e.g. '4 biscuits and 1 tea?'. For diagram items, say what to do, e.g. 'Name the 1st angle'."),
  questionType: z.enum(QUESTION_TYPES),
  topic: z.string().describe("Short skill, e.g. 'Angles', 'Division', 'Synonyms', 'Spelling'."),
  options: z.array(z.string()).describe("Choices for multiple_choice (e.g. the angle names, or the words to underline from). Empty otherwise."),
  selectCount: z.number().int().describe("How many options must be chosen (1 normally, 2 for 'underline two words')."),
  unit: z.string().nullable().describe("Unit for the answer box if any, e.g. 'p', 'cm'. null otherwise."),
  visualReference: z.string().nullable().describe("If a diagram/table/picture is needed, where it is (e.g. 'the 2nd angle in the top row on page 1'). Must NOT reveal the answer. null otherwise."),
  figureBox: z.array(z.number()).nullable().describe("If the child must SEE a picture for this item (angle, shape, clock, table, diagram): its bounding box on its page as [ymin, xmin, ymax, xmax] scaled 0-1000. Box only the picture this item needs (e.g. one angle), not the answer line. null if no picture is needed."),
  marks: z.number().int().describe("Marks available. 1 for most items; more for multi-step problems or definitions. 0 for not_digital."),
  expectedAnswer: z.string().describe("The correct answer. For open questions, a model answer."),
  acceptableAnswers: z.array(z.string()).describe("Other correct forms/answers, e.g. '£15.40' for '1540p'."),
  markingCriteria: z.string().describe("How to mark, what to accept, and when to give partial marks."),
  workingSteps: z.array(z.string()).describe("Child-friendly steps to reach the answer (especially Maths)."),
  confidence: z.enum(["high", "medium", "low"]).describe("How confident you are in reading the question AND the expected answer."),
  reviewReason: z.string().nullable().describe("Why a parent should check this item (unclear text, ambiguous diagram, several possible answers). null if confident."),
});

export const extractedSectionSchema = z.object({
  subject: z.enum(SECTION_SUBJECTS),
  sectionTitle: z.string().describe("Heading for this section, e.g. 'Maths Paper 8 - Q1 Angles' or 'Reasoning - Q3 Letter sequences'."),
  instructions: z.string().nullable().describe("Section instructions exactly as printed, including any word box the student needs."),
  questions: z.array(extractedQuestionSchema),
});

export const extractionResultSchema = z.object({
  isHomework: z.boolean(),
  suggestedTitle: z.string().nullable(),
  sections: z.array(extractedSectionSchema),
});

export type ExtractedQuestion = z.infer<typeof extractedQuestionSchema>;
export type ExtractedSection = z.infer<typeof extractedSectionSchema>;
