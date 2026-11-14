import "@/test/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareAnswers } from "./answerCompare";
import { countPdfPages, sniffImageType, validateWorksheetBuffer } from "./image";
import { openPracticeToken, sealPracticeToken } from "./practiceToken";
import { toSecondPerson } from "./validation";

const N = { numeric: true };

describe("compareAnswers", () => {
  const cases: [string, string, string[], boolean, string][] = [
    ["144", "144", [], true, "match"],
    ["20", "25", [], true, "mismatch"],
    ["1,000", "1000", [], true, "match"],
    ["2/4", "1/2", [], true, "match"],
    ["0.5", "1/2", [], true, "unknown"],
    ["0.5", "1/2", ["0.5"], true, "match"],
    ["7 r 2", "7 remainder 2", [], true, "match"],
    ["7 r 3", "7 r 2", [], true, "mismatch"],
    ["24cm", "24 centimetres", [], true, "match"],
    ["£15.40", "1540p", [], true, "match"],
    ["120 cm", "1 m", [], true, "unknown"],
    ["thirty", "30", [], true, "unknown"],
    ["Quickly.", "quickly", [], false, "match"],
    ["fast", "quickly", [], false, "unknown"],
    ["", "5", [], true, "unknown"],
  ];
  for (const [student, expected, acceptable, numeric, want] of cases) {
    it(`${JSON.stringify(student)} vs ${JSON.stringify(expected)} -> ${want}`, () => {
      assert.equal(compareAnswers(student, expected, acceptable, numeric ? N : {}), want);
    });
  }
});

describe("file validation", () => {
  it("detects real types from magic bytes", () => {
    assert.equal(sniffImageType(Buffer.from("%PDF-1.7\n")), "application/pdf");
    assert.equal(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(sniffImageType(Buffer.from("GIF89a")), null);
  });

  it("rejects a text file renamed to .pdf", () => {
    assert.throws(() => validateWorksheetBuffer(Buffer.from("not really a pdf"), "application/pdf"), /doesn't look like/);
  });

  it("rejects oversized files", () => {
    assert.throws(() => validateWorksheetBuffer(Buffer.alloc(11), "application/pdf", { maxBytes: 10 }), /must be/);
  });

  it("counts PDF pages from the page tree", () => {
    const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 13 >> endobj\n");
    assert.equal(countPdfPages(pdf), 13);
    const loose = Buffer.from("%PDF-1.4\n<< /Type /Page >> << /Type /Page >>");
    assert.equal(countPdfPages(loose), 2);
    assert.equal(countPdfPages(Buffer.from("%PDF-1.5 compressed")), null);
  });
});

describe("practice tokens", () => {
  const payload = {
    subject: "Maths" as const,
    topic: "Division",
    originalQuestion: "125 / 5",
    question: "150 / 5",
    expectedAnswer: "30",
    acceptableAnswers: [],
    answerType: "number" as const,
    hint: "h",
    solutionSteps: [],
  };

  it("round-trips and hides the answer", () => {
    const token = sealPracticeToken(payload);
    assert.ok(!Buffer.from(token, "base64url").toString("latin1").includes('"30"'));
    assert.equal(openPracticeToken(token)?.expectedAnswer, "30");
  });

  it("rejects tampered tokens", () => {
    const token = sealPracticeToken(payload);
    const tampered = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    assert.equal(openPracticeToken(tampered), null);
  });
});

describe("toSecondPerson", () => {
  it("talks to the child", () => {
    assert.equal(toSecondPerson("The student's answer is blurred."), "Your answer is blurred.");
    assert.equal(toSecondPerson("the student has added instead"), "You have added instead");
  });
});
