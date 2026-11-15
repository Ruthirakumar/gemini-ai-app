import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupQuestions, mainNumberOf, partLabel } from "./grouping";

const q = (questionNumber: string, parentNumber: string | null = null, parentText: string | null = null) => ({
  questionNumber,
  data: { parentNumber, parentText },
});

describe("groupQuestions", () => {
  it("groups sub-questions under their main question", () => {
    const groups = groupQuestions([
      q("5a", "5", "Calculate the following:"),
      q("5b", "5"),
      q("5c", "5"),
      q("6"),
      q("7a"),
      q("7b"),
    ]);
    assert.deepEqual(groups.map((g) => [g.label, g.parts.length, g.stem]), [
      ["5", 3, "Calculate the following:"],
      ["6", 1, null],
      ["7", 2, null],
    ]);
  });

  it("understands the different sub-question label styles", () => {
    for (const label of ["5a", "5 a", "5(b)", "5 - 2", "5-2", "5.3"]) assert.equal(mainNumberOf(q(label)), "5", label);
    for (const label of ["5", "Extra 1", "Adventure - type"]) assert.equal(mainNumberOf(q(label)), null, label);
  });

  it("joins a bare number with its numbered continuation (13, 13-2)", () => {
    assert.deepEqual(groupQuestions([q("13"), q("13-2"), q("13-3"), q("14")]).map((g) => g.parts.length), [3, 1]);
  });

  it("does not merge different main questions with the same parent text", () => {
    assert.equal(groupQuestions([q("1a", "1"), q("2a", "2")]).length, 2);
  });

  it("labels parts a, b, c", () => {
    const [group] = groupQuestions([q("5a", "5"), q("5b", "5")]);
    assert.equal(partLabel(group, 1, group.parts[1]), "b");
  });
});
