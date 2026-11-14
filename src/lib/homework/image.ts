import { createPartFromBase64, createPartFromUri, type Part } from "@google/genai";
import { gemini } from "@/lib/gemini";
import {
  ALLOWED_UPLOAD_TYPES,
  AllowedUploadType,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
} from "./constants";
import { HomeworkError } from "./errors";

export interface ValidatedImage {
  mimeType: AllowedUploadType;
  base64: string;
  bytes: number;
  /** Number of pages (1 for images; parsed for PDFs, null if unknown). */
  pages: number | null;
}

/** Detects the real file type from its magic bytes. */
export function sniffImageType(bytes: Uint8Array): AllowedUploadType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && // RIFF
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50 // WEBP
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d // %PDF-
  ) {
    return "application/pdf";
  }
  return null;
}

/**
 * Best-effort PDF page count without a PDF library: reads the /Count of the
 * page tree, falling back to counting page objects. Returns null if unsure
 * (e.g. page tree hidden inside compressed object streams).
 */
export function countPdfPages(buffer: Buffer): number | null {
  const text = buffer.toString("latin1");
  let best = 0;
  const treePattern = /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages\b/g;
  for (const match of text.matchAll(treePattern)) {
    best = Math.max(best, Number(match[1] ?? match[2]));
  }
  if (best > 0) return best;
  const pageObjects = text.match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;
  return pageObjects > 0 ? pageObjects : null;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value;
}

/**
 * Validates one worksheet file's real type and size. Shared by the photo
 * checker and the homework library.
 */
export function validateWorksheetBuffer(
  buffer: Buffer,
  declaredType: string | null,
  { label = "Your file", maxBytes = MAX_IMAGE_BYTES }: { label?: string; maxBytes?: number } = {}
): ValidatedImage {
  if (declaredType && !(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(declaredType)) {
    throw new HomeworkError(415, "unsupported_type", `${label} isn't a supported format. Please use a PDF, JPG, PNG or WebP.`);
  }
  if (buffer.length === 0) {
    throw new HomeworkError(400, "empty_file", `${label} is empty. Please choose another file.`);
  }
  if (buffer.length > maxBytes) {
    throw new HomeworkError(
      413,
      "file_too_large",
      `${label} is ${formatBytes(buffer.length)}. Each file must be ${formatBytes(maxBytes)} or smaller.`
    );
  }
  const realType = sniffImageType(buffer.subarray(0, 16));
  if (!realType) {
    throw new HomeworkError(
      415,
      "invalid_image",
      `${label} doesn't look like a real PDF, JPG, PNG or WebP file. Please try a different file.`
    );
  }
  return {
    // Trust the detected type over the declared one (e.g. a PNG renamed to .jpg).
    mimeType: realType,
    base64: buffer.toString("base64"),
    bytes: buffer.length,
    pages: realType === "application/pdf" ? countPdfPages(buffer) : 1,
  };
}

/**
 * Validates uploaded worksheet files for the photo checker: count, declared
 * type, real type (magic bytes), per-file size and total size. Files stay in
 * memory only.
 */
export async function validateUploadedImages(entries: FormDataEntryValue[]): Promise<ValidatedImage[]> {
  const files = entries.filter(isFile);

  if (files.length === 0) {
    throw new HomeworkError(400, "no_image", "Please add a photo of your homework first.");
  }
  if (files.length > MAX_IMAGES) {
    throw new HomeworkError(400, "too_many_images", `Please upload up to ${MAX_IMAGES} files at a time.`);
  }

  let total = 0;
  const images: ValidatedImage[] = [];

  for (const [index, file] of files.entries()) {
    const label = files.length > 1 ? `File ${index + 1}` : "Your file";
    if (file.size > MAX_IMAGE_BYTES) {
      // Check before reading the whole file into memory.
      throw new HomeworkError(
        413,
        "file_too_large",
        `${label} is ${formatBytes(file.size)}. Each file must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`
      );
    }
    total += file.size;
    if (total > MAX_TOTAL_BYTES) {
      throw new HomeworkError(
        413,
        "total_too_large",
        `Together your files are too big. Please keep the total under ${formatBytes(MAX_TOTAL_BYTES)}.`
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push(validateWorksheetBuffer(buffer, file.type, { label }));
  }

  return images;
}

/** Inline requests to Gemini are limited to ~20 MB (base64 adds a third). */
const MAX_INLINE_BYTES = 14 * 1024 * 1024;

/**
 * Converts a validated file into a Gemini content part. Large files are sent
 * through the Gemini Files API (auto-deleted by Google after 48 hours).
 */
export async function toGeminiPart(file: ValidatedImage): Promise<Part> {
  if (file.bytes <= MAX_INLINE_BYTES) {
    return createPartFromBase64(file.base64, file.mimeType);
  }
  const uploaded = await gemini.files.upload({
    file: new Blob([Buffer.from(file.base64, "base64")], { type: file.mimeType }),
    config: { mimeType: file.mimeType },
  });
  if (!uploaded.uri || !uploaded.mimeType) {
    throw new Error("Gemini file upload returned no URI");
  }
  return createPartFromUri(uploaded.uri, uploaded.mimeType);
}
