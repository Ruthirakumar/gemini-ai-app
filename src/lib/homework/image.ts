import {
  ALLOWED_IMAGE_TYPES,
  AllowedImageType,
  formatBytes,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_TOTAL_BYTES,
} from "./constants";
import { HomeworkError } from "./errors";

export interface ValidatedImage {
  mimeType: AllowedImageType;
  base64: string;
  bytes: number;
}

/** Detects the real image type from the file's magic bytes. */
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
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
  return null;
}

function isFile(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value;
}

/**
 * Validates uploaded worksheet images: count, declared type, real type
 * (magic bytes), per-file size and total size. Images stay in memory only.
 */
export async function validateUploadedImages(entries: FormDataEntryValue[]): Promise<ValidatedImage[]> {
  const files = entries.filter(isFile);

  if (files.length === 0) {
    throw new HomeworkError(400, "no_image", "Please add a photo of your homework first.");
  }
  if (files.length > MAX_IMAGES) {
    throw new HomeworkError(400, "too_many_images", `Please upload up to ${MAX_IMAGES} pictures at a time.`);
  }

  let total = 0;
  const images: ValidatedImage[] = [];

  for (const [index, file] of files.entries()) {
    const label = files.length > 1 ? `Picture ${index + 1}` : "Your picture";

    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      throw new HomeworkError(415, "unsupported_type", `${label} isn't a supported format. Please use a JPG, PNG or WebP image.`);
    }
    if (file.size === 0) {
      throw new HomeworkError(400, "empty_file", `${label} is empty. Please choose another picture.`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new HomeworkError(
        413,
        "file_too_large",
        `${label} is ${formatBytes(file.size)}. Each picture must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`
      );
    }

    total += file.size;
    if (total > MAX_TOTAL_BYTES) {
      throw new HomeworkError(
        413,
        "total_too_large",
        `Together your pictures are too big. Please keep the total under ${formatBytes(MAX_TOTAL_BYTES)}.`
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const realType = sniffImageType(buffer.subarray(0, 16));
    if (!realType) {
      throw new HomeworkError(
        415,
        "invalid_image",
        `${label} doesn't look like a real JPG, PNG or WebP image. Please try a different picture.`
      );
    }

    // Trust the detected type over the declared one (e.g. a PNG renamed to .jpg).
    images.push({ mimeType: realType, base64: buffer.toString("base64"), bytes: file.size });
  }

  return images;
}
