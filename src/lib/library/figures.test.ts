import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { figureKey, normaliseBox } from "./figures";

describe("normaliseBox", () => {
  it("accepts a sensible picture box", () => {
    assert.deepEqual(normaliseBox([300, 150, 450, 320]), [300, 150, 450, 320]);
  });
  it("clamps to the page", () => {
    assert.deepEqual(normaliseBox([-20, 100, 300, 1200]), [0, 100, 300, 1000]);
  });
  it("rejects malformed, inverted, tiny or whole-page boxes", () => {
    for (const bad of [null, [1, 2, 3], ["a", 1, 2, 3], [500, 100, 400, 300], [100, 100, 110, 110], [0, 0, 1000, 1000]]) {
      assert.equal(normaliseBox(bad), null, JSON.stringify(bad));
    }
  });
});

describe("figureKey", () => {
  it("treats near-identical boxes as the same picture", () => {
    assert.equal(figureKey(3, [100, 200, 300, 400]), figureKey(3, [101, 199, 302, 398]));
    assert.notEqual(figureKey(3, [100, 200, 300, 400]), figureKey(4, [100, 200, 300, 400]));
  });
});
