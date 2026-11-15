import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { guardReply, type QuestionTutorContext } from "./questionTutor";
import { findSpellingList, isDictionarySection, isSingleWordStem } from "./spelling";

describe("findSpellingList", () => {
  it("reads a comma list from the question (Week 8)", () => {
    const list = findSpellingList({
      questionType: "not_digital",
      questionText: "Learn the spelling list: Wander, Worry, Swallow, Beware, Swollen, Inward, Swoop, Sword, Mission, Impossible, Impress, Hassle, Process, Session, Passive.",
      sectionTitle: "Year 4 11+ - Spellings Homework Week 8 (Basic)",
      instructions: "Spellings Practice. Spellings to Learn: READ, LEARN, COVER, WRITE",
    });
    assert.equal(list?.words.length, 15);
    assert.equal(list?.words[0], "Wander");
    assert.equal(list?.words[14], "Passive");
  });

  it("prefers the numbered list and removes it from the instructions (Week 7)", () => {
    const list = findSpellingList({
      questionType: "not_digital",
      questionText: "Practice spelling the list of 3 words: Broken, Hockey, Package.",
      sectionTitle: "Spellings Homework Week 7",
      instructions: "Spellings to Learn: READ, LEARN, COVER, WRITE\n1. Broken\n2. Hockey\n3. Package",
    });
    assert.deepEqual(list, { words: ["Broken", "Hockey", "Package"], intro: "Spellings to Learn: READ, LEARN, COVER, WRITE" });
  });

  it("ignores answerable questions and non-spelling sections", () => {
    const base = { questionText: "Learn: cat, dog, fish, bird", sectionTitle: "Spellings", instructions: null };
    assert.equal(findSpellingList({ ...base, questionType: "short_text" }), null);
    assert.equal(findSpellingList({ ...base, questionType: "not_digital", sectionTitle: "Times tables" }), null);
    assert.equal(
      findSpellingList({ questionType: "not_digital", questionText: "Draw a picture of your favourite spelling word, then colour it in.", sectionTitle: "Spelling", instructions: null }),
      null
    );
  });
});

describe("dictionary words", () => {
  it("spots one-word stems and dictionary sections", () => {
    assert.equal(isSingleWordStem("Adventure"), true);
    assert.equal(isSingleWordStem("Using the price list, how much is:"), false);
    assert.equal(isSingleWordStem(null), false);
    assert.equal(isDictionarySection("Dictionary Homework Week 8", null), true);
    assert.equal(isDictionarySection("Angles", "Name each angle"), false);
  });
});

describe("guardReply", () => {
  const ctx: QuestionTutorContext = {
    subject: "Maths",
    sectionTitle: "Times tables",
    instructions: null,
    stem: null,
    questionText: "7 x 8 =",
    studentAnswer: "54",
    answerShown: false,
    expectedAnswer: "56",
    acceptableAnswers: [],
    explanation: null,
    workingSteps: [],
    hint: "Try 7 x 7 first, then add 7.",
  };

  it("blocks a reply that gives the answer while the child is still trying", () => {
    const reply = guardReply("It's 56 because 7 eights are 56.", ctx);
    assert.ok(!reply.includes("56"));
    assert.ok(reply.includes("Try 7 x 7 first"));
  });

  it("allows it once the answer has been shown", () => {
    assert.equal(guardReply("It's 56.", { ...ctx, answerShown: true }), "It's 56.");
  });

  it("does not block explaining a single-word answer like a word class", () => {
    const words = { ...ctx, expectedAnswer: "noun" };
    assert.equal(guardReply("A noun is a naming word.", words), "A noun is a naming word.");
  });
});
