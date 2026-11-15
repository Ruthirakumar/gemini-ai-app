import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSectionHistory } from "./history";

const sections = [
  { id: "maths", title: "Maths", subject: "Maths" as const, marks: new Map([["m1", 1], ["m2", 2]]) },
  { id: "eng", title: "Reasoning", subject: "English" as const, marks: new Map([["e1", 1], ["e2", 1]]) },
];

describe("buildSectionHistory", () => {
  const history = buildSectionHistory(
    sections,
    [
      { id: "retake1", sectionId: "eng", date: "2026-11-16T10:00:00Z" },
      { id: "whole1", sectionId: null, date: "2026-11-15T10:00:00Z" },
    ],
    [
      { attemptId: "whole1", questionId: "m1", status: "correct", awardedMarks: 1 },
      { attemptId: "whole1", questionId: "m2", status: "partially_correct", awardedMarks: 1 },
      { attemptId: "whole1", questionId: "e1", status: "incorrect", awardedMarks: 0 },
      { attemptId: "whole1", questionId: "e2", status: "unanswered", awardedMarks: 0 },
      { attemptId: "retake1", questionId: "e1", status: "correct", awardedMarks: 1 },
      { attemptId: "retake1", questionId: "e2", status: "needs_review", awardedMarks: 0 },
    ]
  );

  it("scores each section from a whole attempt", () => {
    assert.deepEqual(history[0].entries.map((e) => [e.kind, e.score, e.total]), [["whole", 2, 3]]);
  });

  it("adds retakes to their own section only, oldest first", () => {
    assert.deepEqual(history[1].entries.map((e) => [e.attemptId, e.kind, e.score, e.total]), [
      ["whole1", "whole", 0, 2],
      ["retake1", "retake", 1, 1], // needs_review left out of the total
    ]);
  });

  it("reports best and latest percentages", () => {
    assert.equal(history[1].best, 100);
    assert.equal(history[1].latest, 100);
    assert.equal(history[0].best, 67);
  });
});
