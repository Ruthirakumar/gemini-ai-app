import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import type { PracticeTokenPayload } from "./types";

/**
 * Practice answers must never reach the browser before the student answers.
 * Instead of a database, the server encrypts the practice question + answer
 * (AES-256-GCM, authenticated) into an opaque token the browser sends back.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.PRACTICE_TOKEN_SECRET || process.env.GEMINI_API_KEY;
  if (!secret) throw new Error("No secret available for practice tokens");
  // Derive a separate key so the API key itself is never used directly.
  cachedKey = Buffer.from(
    hkdfSync("sha256", secret, "ai-homework-buddy", "practice-token-v1", 32)
  );
  return cachedKey;
}

export function sealPracticeToken(payload: Omit<PracticeTokenPayload, "v" | "issuedAt">): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const plaintext = Buffer.from(
    JSON.stringify({ ...payload, v: 1, issuedAt: Date.now() } satisfies PracticeTokenPayload),
    "utf8"
  );
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

/** Returns null if the token is invalid, tampered with or expired. */
export function openPracticeToken(token: string): PracticeTokenPayload | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const payload = JSON.parse(plaintext) as PracticeTokenPayload;
    if (payload.v !== 1 || Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}
