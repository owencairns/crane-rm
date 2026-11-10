"use node";

import crypto from "crypto";
import { analysisConfig } from "./analysisConfig";
import type { OcrPage, OcrResult, ChunkData } from "./types";

/* ------------------------------------------------------------------ */
/*  Mistral OCR                                                       */
/* ------------------------------------------------------------------ */

const MISTRAL_OCR_ENDPOINT = "https://api.mistral.ai/v1/ocr";

interface MistralOcrImage {
  id?: string;
  image_base64?: string | null;
}

interface MistralOcrPage {
  index?: number;
  markdown?: string;
  images?: MistralOcrImage[];
}

/**
 * Parse a PDF via Mistral OCR (`mistral-ocr-latest`).
 * Accepts either a public URL or a raw Buffer (sent as a base64 data URI).
 *
 * Mistral returns one entry per page with clean markdown, so we map pages
 * directly instead of heuristically re-splitting a single markdown blob (as
 * the previous GLM integration had to).
 */
export async function parsePdfWithOcr(
  pdfInput: string | Buffer,
  apiKey: string
): Promise<OcrResult> {
  const documentUrl = Buffer.isBuffer(pdfInput)
    ? `data:application/pdf;base64,${pdfInput.toString("base64")}`
    : pdfInput;

  const response = await fetch(MISTRAL_OCR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "document_url", document_url: documentUrl },
      include_image_base64: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Mistral OCR failed (${response.status}): ${body}`);
  }

  const result = (await response.json()) as { pages?: MistralOcrPage[] };
  const rawPages = Array.isArray(result.pages) ? result.pages : [];

  const pages: OcrPage[] = rawPages.map((page, i) => {
    const pageNumber = typeof page.index === "number" ? page.index + 1 : i + 1;
    const images: OcrPage["images"] = (page.images ?? [])
      .map((img) => {
        const url = toImageDataUri(img);
        return url ? { url, altText: img.id || `Image on page ${pageNumber}` } : null;
      })
      .filter((img): img is { url: string; altText: string } => img !== null);
    return { pageNumber, markdown: (page.markdown ?? "").trim(), images };
  });

  const rawMarkdown = pages.map((p) => p.markdown).join("\n\n\f\n\n");

  return { pages, pageCount: pages.length, rawMarkdown };
}

/**
 * Normalize a Mistral OCR image into a `data:` URI that the downstream image
 * store understands. Mistral may return either a bare base64 string or an
 * already-prefixed data URI; we infer the mime type from the image id when a
 * prefix is missing (defaulting to JPEG).
 */
function toImageDataUri(img: MistralOcrImage): string | null {
  const b64 = img.image_base64;
  if (!b64) return null;
  if (b64.startsWith("data:")) return b64;
  const ext = (img.id || "").split(".").pop()?.toLowerCase();
  const mime =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

/* ------------------------------------------------------------------ */
/*  Chunking — 5-10k character chunks                                 */
/* ------------------------------------------------------------------ */

export function chunkOcrPages(
  pages: OcrPage[],
  _imageStartIdx = 0
): { chunks: ChunkData[]; imageCount: number } {
  const maxChars = analysisConfig.chunking.maxChars;
  const overlapChars = analysisConfig.chunking.overlapChars;

  // Flatten all page text into one stream, tracking page boundaries
  const pageTexts = pages.map((p) => ({ text: p.markdown, pageNumber: p.pageNumber }));

  const chunks: ChunkData[] = [];
  let buf = "";
  let pageStart = pageTexts[0]?.pageNumber ?? 1;
  let pageEnd = pageStart;

  for (const page of pageTexts) {
    const toAdd = (buf ? "\n\n" : "") + page.text;

    if (buf.length + toAdd.length > maxChars && buf.length > 0) {
      // Flush current buffer as a chunk
      chunks.push(makeChunk(buf, pageStart, pageEnd));

      // Overlap: carry tail of previous chunk
      const overlap = buf.slice(-overlapChars);
      buf = overlap + "\n\n" + page.text;
      pageStart = page.pageNumber;
    } else {
      buf += toAdd;
    }
    pageEnd = page.pageNumber;
  }

  // If the buffer is still too large (single giant page), split it
  if (buf.length > maxChars) {
    const pieces = splitByChars(buf, maxChars, overlapChars);
    for (const piece of pieces) {
      chunks.push(makeChunk(piece, pageStart, pageEnd));
    }
  } else if (buf.length > 0) {
    chunks.push(makeChunk(buf, pageStart, pageEnd));
  }

  return { chunks, imageCount: 0 };
}

function splitByChars(text: string, maxChars: number, overlapChars: number): string[] {
  const pieces: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];
  let currentLen = 0;

  for (const line of lines) {
    if (currentLen + line.length + 1 > maxChars && current.length > 0) {
      pieces.push(current.join("\n"));
      // Overlap from tail
      const overlapText = current.join("\n").slice(-overlapChars);
      current = [overlapText];
      currentLen = overlapText.length;
    }
    current.push(line);
    currentLen += line.length + 1;
  }

  if (current.length > 0) pieces.push(current.join("\n"));
  return pieces.length > 0 ? pieces : [text];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makeChunk(text: string, pageStart: number, pageEnd: number): ChunkData {
  return {
    text,
    pageStart,
    pageEnd,
    sectionPath: extractSectionPath(text),
    textHash: hashText(text),
    imageRefs: [],
  };
}

function extractSectionPath(text: string): string | undefined {
  for (const line of text.split("\n").slice(0, 5)) {
    const trimmed = line.trim();
    const m = trimmed.match(/^(ARTICLE|SECTION|PART)\s+([IVX0-9.]+)(.*)$/i);
    if (m) return m[0].trim();
    const n = trimmed.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    if (n && n[1].length < 20) return n[0].trim();
  }
  return undefined;
}

function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function generateChunkId(contractId: string, index: number): string {
  return `${contractId}_chunk_${index.toString().padStart(4, "0")}`;
}
