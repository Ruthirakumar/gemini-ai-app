import "@/test/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeChunks, pagesWithoutQuestions } from "./extraction";
import type { ExtractedQuestion, ExtractedSection } from "./types";

const q = (questionNumber: string, page: number, parentNumber: string | null = null): ExtractedQuestion => ({
  questionNumber,
  page,
  parentNumber,
  parentText: null,
  questionText: `Question ${questionNumber}`,
  questionType: "short_text",
  topic: "",
  options: [],
  selectCount: 1,
  unit: null,
  visualReference: null,
  figureBox: null,
  marks: 1,
  expectedAnswer: "x",
  acceptableAnswers: [],
  markingCriteria: "",
  workingSteps: [],
  confidence: "high",
  reviewReason: null,
});

const section = (subject: "English" | "Maths", sectionTitle: string, questions: ExtractedQuestion[]): ExtractedSection => ({
  subject,
  sectionTitle,
  instructions: null,
  questions,
});

describe("mergeChunks", () => {
  it("joins a section continued on the next chunk under a guessed title (Q7 -> Q8)", () => {
    const merged = mergeChunks([
      [section("English", "Reasoning Paper 8", [q("6a", 9, "6"), q("7a", 9, "7")])],
      [section("English", "Maths Paper 8 - Q8 Fill in the blanks", [q("8a", 10, "8"), q("8b", 10, "8")]), section("English", "Spellings", [q("1", 11)])],
    ]);
    assert.deepEqual(merged.map((s) => [s.sectionTitle, s.questions.length]), [
      ["Reasoning Paper 8", 4],
      ["Spellings", 1],
    ]);
  });

  it("keeps a new paper that starts at a chunk boundary as its own section", () => {
    const merged = mergeChunks([
      [section("Maths", "Maths Paper", [q("15", 5), q("16", 5)])],
      [section("Maths", "Another Paper", [q("1", 6)])],
    ]);
    assert.equal(merged.length, 2);
  });

  it("does not join different subjects", () => {
    const merged = mergeChunks([[section("Maths", "Paper", [q("7", 3)])], [section("English", "Reasoning", [q("8", 4)])]]);
    assert.equal(merged.length, 2);
  });

  it("shifts restarted numbering when a same-titled section continues (dictionary page 2)", () => {
    const merged = mergeChunks([
      [section("English", "Dictionary", [q("1a", 12, "1"), q("1b", 12, "1"), q("9a", 12, "9")])],
      [section("English", "Dictionary", [q("1a", 13, "1"), q("1b", 13, "1")])],
    ]);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0].questions.slice(3).map((x) => [x.questionNumber, x.parentNumber]), [
      ["10a", "10"],
      ["10b", "10"],
    ]);
  });
});

describe("pagesWithoutQuestions", () => {
  it("finds pages the model skipped", () => {
    const sections = [section("Maths", "P", [q("1", 1), q("2", 2), q("9", 4)])];
    assert.deepEqual(pagesWithoutQuestions(sections, 5), [3, 5]);
  });
});
