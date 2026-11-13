// Shared by client and server. Must not import any server-only modules.

export const SUBJECT_OPTIONS = ["auto", "english", "maths"] as const;
export type SubjectOption = (typeof SUBJECT_OPTIONS)[number];

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per image
export const MAX_IMAGES = 3;
// Gemini inline requests are capped at ~20 MB; base64 adds ~33%.
export const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

export const MAX_PRACTICE_ATTEMPTS = 3;
export const MAX_PRACTICE_ANSWER_LENGTH = 300;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Client-side pre-check. The server repeats this validation (and checks file contents). */
export function describeImageProblem(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" isn't a supported picture. Please use a JPG, PNG or WebP image.`;
  }
  if (file.size === 0) {
    return `"${file.name}" looks empty. Please choose another picture.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. Pictures must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`;
  }
  return null;
}
