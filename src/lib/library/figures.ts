import path from "node:path";
import { createCanvas, loadImage, type Canvas, type Image } from "@napi-rs/canvas";
import type { ValidatedImage } from "@/lib/homework/image";

/**
 * Crops the pictures questions depend on (angles, clocks, shapes, tables) out
 * of the original worksheet so they can be shown next to each question.
 * Boxes come from Gemini as [ymin, xmin, ymax, xmax] on a 0-1000 scale.
 */

export type Box = [number, number, number, number];

export interface FigureRequest {
  key: string;
  page: number;
  box: Box;
}

const PDF_SCALE = 2; // ~144 dpi: clear enough for angle arcs and clock hands
const PADDING = 0.015; // 1.5% of the page around each picture
const MAX_WIDTH = 1000;

/** Checks a model-supplied box; returns a clean box or null if unusable. */
export function normaliseBox(raw: unknown): Box | null {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const [y0, x0, y1, x1] = raw.map((n) => Math.min(1000, Math.max(0, n))) as Box;
  const height = y1 - y0;
  const width = x1 - x0;
  if (height <= 0 || width <= 0) return null;
  const area = (height * width) / 1_000_000;
  // Too small to be a real picture, or so big it's just the whole page.
  if (area < 0.002 || area > 0.85) return null;
  return [y0, x0, y1, x1];
}

/** Same picture for several sub-questions -> one crop. */
export const figureKey = (page: number, box: Box) => `${page}:${box.map((n) => Math.round(n / 5) * 5).join(",")}`;

type Source = Canvas | Image;

async function renderPdfPages(buffer: Buffer, pages: number[]): Promise<Map<number, Canvas>> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    // pdfjs needs forward slashes and a trailing "/" (also on Windows).
    standardFontDataUrl: path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts").replace(/\\/g, "/") + "/",
  }).promise;

  const rendered = new Map<number, Canvas>();
  try {
    for (const pageNumber of pages) {
      if (pageNumber < 1 || pageNumber > doc.numPages) continue;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: PDF_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      rendered.set(pageNumber, canvas);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return rendered;
}

async function cropOne(source: Source, box: Box): Promise<Buffer> {
  const { width, height } = source;
  const [y0, x0, y1, x1] = box;
  const left = Math.max(0, Math.floor((x0 / 1000 - PADDING) * width));
  const top = Math.max(0, Math.floor((y0 / 1000 - PADDING) * height));
  const right = Math.min(width, Math.ceil((x1 / 1000 + PADDING) * width));
  const bottom = Math.min(height, Math.ceil((y1 / 1000 + PADDING) * height));
  const sw = right - left;
  const sh = bottom - top;
  const scale = Math.min(1, MAX_WIDTH / sw);
  const out = createCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const context = out.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, out.width, out.height);
  context.drawImage(source, left, top, sw, sh, 0, 0, out.width, out.height);
  return out.encode("png");
}

/**
 * Returns a PNG for each request key. Requests that can't be cropped (bad page,
 * unreadable file) are skipped rather than failing the whole extraction.
 */
export async function cropFigures(file: ValidatedImage, requests: FigureRequest[]): Promise<Map<string, Buffer>> {
  const crops = new Map<string, Buffer>();
  if (requests.length === 0) return crops;
  const buffer = Buffer.from(file.base64, "base64");

  const sources = new Map<number, Source>();
  if (file.mimeType === "application/pdf") {
    const pages = [...new Set(requests.map((r) => r.page))].sort((a, b) => a - b);
    for (const [page, canvas] of await renderPdfPages(buffer, pages)) sources.set(page, canvas);
  } else {
    sources.set(1, await loadImage(buffer));
  }

  for (const request of requests) {
    if (crops.has(request.key)) continue;
    const source = sources.get(file.mimeType === "application/pdf" ? request.page : 1);
    if (!source) continue;
    try {
      crops.set(request.key, await cropOne(source, request.box));
    } catch (error) {
      console.warn("[figures] crop failed", { page: request.page, name: error instanceof Error ? error.name : typeof error });
    }
  }
  return crops;
}
