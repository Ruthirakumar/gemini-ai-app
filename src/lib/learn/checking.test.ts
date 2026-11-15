import "@/test/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCheck, EMPTY_CHECK, toCheckView } from "./checking";
import type { MarkOutcome } from "./marking";

const outcome = (status: MarkOutcome["status"], over: Partial<MarkOutcome> = {}): MarkOutcome => ({
  questionId: "q1",
  status,
  awardedMarks: status === "correct" ? 1 : 0,
  correctAnswer: "25",
  feedback: status === "correct" ? "Brilliant!" : "Good try! The correct answer is 25.",
  explanation: "125 ÷ 5 = 25",
  workingSteps: ["5 x 25 = 125"],
  hint: "What times 5 makes 125?",
  ...over,
});
const HIDE = ["25"];

describe("applyCheck", () => {
  it("wrong answer: hint only, never the answer, and records the first try", () => {
    const { row, view } = applyCheck(EMPTY_CHECK, outcome("incorrect"), HIDE);
    assert.equal(view.state, "try_again");
    assert.equal(view.triesLeft, 2);
    assert.equal(view.hint, "What times 5 makes 125?");
    assert.equal(view.correctAnswer, null);
    assert.equal(view.explanation, null);
    assert.ok(!view.feedback.includes("25"), "feedback that reveals the answer is replaced");
    assert.equal(row.correct_answer, null, "answer is not stored before it may be shown");
    assert.deepEqual([row.first_status, row.first_marks, row.locked], ["incorrect", 0, false]);
  });

  it("fixed on the second try: shows the answer, keeps the first-try score, marks as corrected", () => {
    const first = applyCheck(EMPTY_CHECK, outcome("incorrect"), HIDE).row;
    const { row, view } = applyCheck(first, outcome("correct"), HIDE);
    assert.equal(view.state, "correct");
    assert.equal(view.correctAnswer, "25");
    assert.deepEqual([row.first_status, row.first_marks, row.locked, row.corrected], ["incorrect", 0, true, true]);
  });

  it("reveals the answer after the third wrong try", () => {
    let row = applyCheck(EMPTY_CHECK, outcome("incorrect"), HIDE).row;
    row = applyCheck(row, outcome("incorrect"), HIDE).row;
    const third = applyCheck(row, outcome("incorrect"), HIDE);
    assert.equal(third.view.state, "revealed");
    assert.equal(third.view.correctAnswer, "25");
    assert.deepEqual(third.view.workingSteps, ["5 x 25 = 125"]);
    assert.equal(third.row.locked, true);
  });

  it("drops a hint that would give the answer away", () => {
    const { view } = applyCheck(EMPTY_CHECK, outcome("incorrect", { hint: "It's 25!" }), HIDE);
    assert.ok(view.hint && !view.hint.includes("25"));
  });

  it("right first time scores full marks and is not 'corrected'", () => {
    const { row } = applyCheck(EMPTY_CHECK, outcome("correct"), HIDE);
    assert.deepEqual([row.first_status, row.first_marks, row.corrected], ["correct", 1, false]);
  });

  it("rebuilds the same view from the saved row after a reload", () => {
    const { row, view } = applyCheck(EMPTY_CHECK, outcome("incorrect"), HIDE);
    assert.deepEqual(toCheckView("q1", row), view);
  });
});
