// Shared by client and server. Must not import any server-only modules.

export const SUBJECT_OPTIONS = ["auto", "english", "maths"] as const;
export type SubjectOption = (typeof SUBJECT_OPTIONS)[number];

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Worksheets may be photos or a PDF (Gemini reads PDFs natively). */
export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"] as const;
export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

export const ACCEPT_ATTRIBUTE =
  ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

/** Homework library uploads go straight to Supabase Storage, so they can be larger. */
export const MAX_LIBRARY_FILE_BYTES = 20 * 1024 * 1024;

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
export function describeImageProblem(file: File, maxBytes = MAX_IMAGE_BYTES): string | null {
  if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" isn't a supported file. Please use a PDF, JPG, PNG or WebP.`;
  }
  if (file.size === 0) {
    return `"${file.name}" looks empty. Please choose another file.`;
  }
  if (file.size > maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. Files must be ${formatBytes(maxBytes)} or smaller.`;
  }
  return null;
}
