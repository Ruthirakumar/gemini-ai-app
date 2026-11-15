import "@/test/setup";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { retryDelayMs, USER_ACTION_ATTEMPTS, withGeminiRetry } from "./gemini";

describe("Gemini retry", () => {
  it("waits about 1s, 3s, then 6s (plus up to 30% jitter)", () => {
    assert.deepEqual([1, 2, 3].map((a) => retryDelayMs(a, () => 0)), [1000, 3000, 6000]);
    assert.equal(retryDelayMs(1, () => 1), 1300);
    assert.equal(retryDelayMs(9, () => 0), 6000, "never grows beyond 6s");
  });

  it("keeps the total wait for a child's action bounded (~10s worst case without jitter)", () => {
    const total = Array.from({ length: USER_ACTION_ATTEMPTS - 1 }, (_, i) => retryDelayMs(i + 1, () => 0)).reduce((a, b) => a + b, 0);
    assert.equal(total, 10000);
  });

  it("does not retry errors that won't fix themselves (e.g. bad request)", async () => {
    let calls = 0;
    await assert.rejects(
      withGeminiRetry(async () => {
        calls++;
        throw Object.assign(new Error("bad"), { status: 400 });
      }, { maxAttempts: USER_ACTION_ATTEMPTS })
    );
    assert.equal(calls, 1);
  });
});
