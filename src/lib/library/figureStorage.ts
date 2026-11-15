import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedImage } from "@/lib/homework/image";
import { WORKSHEET_BUCKET } from "@/lib/supabase/config";
import type { FigurePlacement } from "./extraction";
import { cropFigures } from "./figures";
import type { EditorSection } from "./types";

/** Cropped pictures live next to the original: "<user>/<set>/figures/<n>.png". */
export const figuresFolder = (userId: string, setId: string) => `${userId}/${setId}/figures`;

export async function removeFigures(supabase: SupabaseClient, userId: string, setId: string) {
  const folder = figuresFolder(userId, setId);
  const { data } = await supabase.storage.from(WORKSHEET_BUCKET).list(folder, { limit: 1000 });
  if (data?.length) {
    await supabase.storage.from(WORKSHEET_BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
  }
}

/**
 * Crops each picture, uploads it to private storage and sets
 * questionData.figurePath on the questions that use it. Pictures are a
 * nice-to-have: any failure leaves the question without a picture rather than
 * failing extraction (the "open the worksheet" fallback still works).
 */
export async function attachFigures(
  supabase: SupabaseClient,
  userId: string,
  setId: string,
  file: ValidatedImage,
  sections: EditorSection[],
  placements: FigurePlacement[]
): Promise<number> {
  if (placements.length === 0) return 0;

  let crops: Map<string, Buffer>;
  try {
    crops = await cropFigures(file, placements);
  } catch (error) {
    console.warn("[figures] cropping failed", { name: error instanceof Error ? error.name : typeof error });
    return 0;
  }

  const folder = figuresFolder(userId, setId);
  const paths = new Map<string, string>();
  let n = 0;
  for (const [key, png] of crops) {
    const path = `${folder}/${++n}.png`;
    const { error } = await supabase.storage
      .from(WORKSHEET_BUCKET)
      .upload(path, png, { contentType: "image/png", upsert: true });
    if (error) console.warn("[figures] upload failed", { name: error.name });
    else paths.set(key, path);
  }

  for (const p of placements) {
    const path = paths.get(p.key);
    const question = sections[p.sectionIndex]?.questions[p.questionIndex];
    if (path && question) question.questionData = { ...question.questionData, figurePath: path };
  }
  return paths.size;
}

/** Short-lived signed URLs for many figure paths at once. */
export async function signFigureUrls(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(WORKSHEET_BUCKET).createSignedUrls(unique, 60 * 60 * 2);
  if (error || !data) {
    console.warn("[figures] signing failed", { name: error?.name });
    return {};
  }
  const urls: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}
