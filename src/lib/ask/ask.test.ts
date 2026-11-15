import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { askRequestSchema, buildContents, type ChatMessage } from "./conversation";
import { pickVoice, splitForSpeech, toSpeakableText } from "./speech";

describe("buildContents", () => {
  it("adds the question after earlier turns, mapping assistant to model", () => {
    const history: ChatMessage[] = [
      { role: "user", content: "What is a noun?" },
      { role: "assistant", content: "A naming word." },
    ];
    assert.deepEqual(buildContents(history, "Give me another one"), [
      { role: "user", parts: [{ text: "What is a noun?" }] },
      { role: "model", parts: [{ text: "A naming word." }] },
      { role: "user", parts: [{ text: "Give me another one" }] },
    ]);
  });

  it("keeps only the most recent messages and starts with the child", () => {
    const history: ChatMessage[] = Array.from({ length: 12 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const turns = buildContents(history, "next", 3); // m9 (assistant) dropped, m10, m11 kept
    assert.equal(turns[0].role, "user");
    assert.deepEqual(turns.map((t) => t.parts[0].text), ["m10", "m11", "next"]);
  });

  it("folds an unanswered question into the new one so roles alternate", () => {
    const turns = buildContents([{ role: "user", content: "first" }], "second");
    assert.deepEqual(turns, [{ role: "user", parts: [{ text: "first\nsecond" }] }]);
  });

  it("accepts requests without history (older clients)", () => {
    assert.deepEqual(askRequestSchema.parse({ message: " hi " }), { message: "hi", history: [] });
    assert.equal(askRequestSchema.safeParse({ message: "   " }).success, false);
  });
});

describe("toSpeakableText", () => {
  it("removes markdown, emojis and links, and speaks maths symbols", () => {
    assert.equal(
      toSpeakableText("## Great job! 🎉\n- **7 × 8 = 56**\n- See [this](https://x.y)"),
      "Great job! 7 times 8 equals 56 See this"
    );
    assert.equal(toSpeakableText("12 ÷ 3 = 4"), "12 divided by 3 equals 4");
  });
});

describe("splitForSpeech", () => {
  it("splits into sentences and breaks up very long ones", () => {
    assert.deepEqual(splitForSpeech("Hi there! What is 2 times 3? It is 6."), ["Hi there!", "What is 2 times 3?", "It is 6."]);
    const long = Array.from({ length: 60 }, () => "word").join(" ");
    const pieces = splitForSpeech(long, 50);
    assert.ok(pieces.length > 1 && pieces.every((p) => p.length <= 50));
    assert.equal(pieces.join(" "), long);
  });
});

describe("pickVoice", () => {
  const v = (name: string, lang: string) => ({ name, lang, localService: true });
  it("prefers a natural British voice", () => {
    const voices = [v("Google US English", "en-US"), v("Microsoft George", "en-GB"), v("Microsoft Sonia Online (Natural)", "en-GB")];
    assert.equal(pickVoice(voices)?.name, "Microsoft Sonia Online (Natural)");
  });
  it("falls back to any English voice, then none", () => {
    assert.equal(pickVoice([v("Thomas", "fr-FR"), v("Samantha", "en_US")])?.name, "Samantha");
    assert.equal(pickVoice([v("Thomas", "fr-FR")]), null);
  });
});
