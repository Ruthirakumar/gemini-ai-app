import "@/test/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markingCriteriaSchema, questionDataSchema, type QuestionType } from "@/lib/library/types";
import { computeScore, markDeterministically, sanitiseModelMark, type MarkableQuestion } from "./marking";

function question(
  type: QuestionType,
  expectedAnswer: string,
  { marks = 1, acceptable = [] as string[], options = [] as string[] } = {}
): MarkableQuestion {
  return {
    id: "q1",
    number: "1",
    text: "question",
    type,
    marks,
    subject: "Maths",
    data: questionDataSchema.parse({ options }),
    criteria: markingCriteriaSchema.parse({ expectedAnswer, acceptableAnswers: acceptable, workingSteps: ["step"] }),
  };
}

type ModelMark = NonNullable<Parameters<typeof sanitiseModelMark>[2]>;
const mark = (over: Partial<ModelMark> = {}): ModelMark => ({
  ref: "r1",
  status: "correct",
  awardedMarks: 1,
  correctAnswer: "x",
  feedback: "The student did well",
  explanation: "e",
  workingSteps: [],
  hint: null,
  ...over,
});

describe("markDeterministically", () => {
  it("marks blank answers as unanswered with the answer and steps", () => {
    const out = markDeterministically(question("number", "221"), "  ");
    assert.equal(out?.status, "unanswered");
    assert.equal(out?.awardedMarks, 0);
    assert.equal(out?.correctAnswer, "221");
    assert.deepEqual(out?.workingSteps, ["step"]);
  });

  it("marks equivalent numbers correct without AI", () => {
    const out = markDeterministically(question("number", "£15.40", { marks: 2, acceptable: ["1540p"] }), "1540p");
    assert.equal(out?.status, "correct");
    assert.equal(out?.awardedMarks, 2);
  });

  it("matches multiple choice regardless of order", () => {
    const q = question("multiple_choice", "sheet, smooth", { options: ["thick", "sheet", "smooth"] });
    assert.equal(markDeterministically(q, "smooth, sheet")?.status, "correct");
    assert.equal(markDeterministically(q, "thick, sheet"), null); // model decides
  });

  it("never auto-accepts text that differs in capitals or punctuation", () => {
    const q = question("short_text", "We went to London on Friday.");
    assert.equal(markDeterministically(q, "We went to london on Friday."), null);
    assert.equal(markDeterministically(q, "We went to London on Friday"), null);
    assert.equal(markDeterministically(q, "  We went to  London on Friday. ")?.status, "correct");
  });

  it("leaves wrong or fuzzy answers to the model", () => {
    assert.equal(markDeterministically(question("number", "221"), "220"), null);
    assert.equal(markDeterministically(question("short_text", "ran"), "runned"), null);
  });
});

describe("sanitiseModelMark", () => {
  it("never lets the model mark a different number as correct", () => {
    const out = sanitiseModelMark(question("number", "852"), "752", mark());
    assert.equal(out.status, "needs_review");
    assert.equal(out.awardedMarks, 0);
  });

  it("forces full marks for correct and clamps partial marks", () => {
    assert.equal(sanitiseModelMark(question("long_text", "a", { marks: 2 }), "b", mark({ awardedMarks: 0 })).awardedMarks, 2);
    const partial = sanitiseModelMark(question("long_text", "a", { marks: 2 }), "b", mark({ status: "partially_correct", awardedMarks: 5 }));
    assert.equal(partial.awardedMarks, 1);
  });

  it("turns partial credit on a 1-mark question into incorrect", () => {
    const out = sanitiseModelMark(question("short_text", "a"), "b", mark({ status: "partially_correct", awardedMarks: 1 }));
    assert.equal(out.status, "incorrect");
    assert.equal(out.awardedMarks, 0);
  });

  it("keeps a helpful hint but drops one that gives the answer away", () => {
    const q = question("number", "25");
    const wrong = { status: "incorrect" as const, correctAnswer: "25" };
    assert.equal(sanitiseModelMark(q, "20", mark({ ...wrong, hint: "What is 5 x 5?" })).hint, "What is 5 x 5?");
    assert.equal(sanitiseModelMark(q, "20", mark({ ...wrong, hint: "The answer is 25." })).hint, null);
  });

  it("flags missing model results for review and rewrites to second person", () => {
    assert.equal(sanitiseModelMark(question("short_text", "a"), "b", undefined).status, "needs_review");
    assert.equal(sanitiseModelMark(question("short_text", "a"), "a", mark()).feedback, "You did well");
  });
});

describe("computeScore", () => {
  it("calculates score server-side and excludes needs_review", () => {
    const score = computeScore(
      [
        { status: "correct", awardedMarks: 2 },
        { status: "partially_correct", awardedMarks: 1 },
        { status: "incorrect", awardedMarks: 0 },
        { status: "unanswered", awardedMarks: 0 },
        { status: "needs_review", awardedMarks: 0 },
      ],
      [2, 2, 1, 1, 3]
    );
    assert.equal(score.score, 3);
    assert.equal(score.totalMarks, 6);
    assert.equal(score.percentage, 50);
    assert.deepEqual(score.counts, { correct: 1, incorrect: 1, partially_correct: 1, unanswered: 1, needs_review: 1 });
  });

  it("returns null percentage when nothing could be scored", () => {
    assert.equal(computeScore([{ status: "needs_review", awardedMarks: 0 }], [1]).percentage, null);
  });
});
