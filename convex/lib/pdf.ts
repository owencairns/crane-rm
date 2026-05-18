"use node";

import crypto from "crypto";
import { analysisConfig } from "./analysisConfig";
import type { OcrPage, OcrResult, ChunkData } from "./types";

/* ------------------------------------------------------------------ */
/*  GLM OCR                                                           */
/* ------------------------------------------------------------------ */

const GLM_OCR_ENDPOINT = "https://api.z.ai/api/paas/v4/layout_parsing";

/**
 * Parse a PDF via GLM OCR.
 * Accepts either a public URL or a raw Buffer (sent as base64).
 */
export async function parsePdfWithOcr(
  pdfInput: string | Buffer,
  apiKey: string
): Promise<OcrResult> {
  const file =
    Buffer.isBuffer(pdfInput)
      ? `data:application/pdf;base64,${pdfInput.toString("base64")}`
      : pdfInput;

  const response = await fetch(GLM_OCR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "glm-ocr", file, return_crop_images: true }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GLM OCR failed (${response.status}): ${body}`);
  }

  const result = await response.json();
  const rawMarkdown = extractMarkdown(result);
  const pages = splitIntoPages(rawMarkdown);

  return { pages, pageCount: pages.length, rawMarkdown };
}

function extractMarkdown(result: Record<string, unknown>): string {
  if (typeof result.content === "string") return result.content;
  if (Array.isArray(result.content)) {
    return (result.content as Array<Record<string, unknown>>)
      .map((c) => (typeof c === "string" ? c : (c.text as string) || ""))
      .join("\n");
  }
  const nested = result.output ?? result.result ?? result.data;
  if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (typeof inner.content === "string") return inner.content;
  }
  if (typeof result.text === "string") return result.text;
  if (typeof result.result === "string") return result.result;
  return JSON.stringify(result);
}

function splitIntoPages(markdown: string): OcrPage[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  let sections = markdown.split("\f").filter((s) => s.trim());

  if (sections.length <= 1) {
    sections = markdown.split(/(?=^#{1,2}\s*Page\s+\d+)/im).filter((s) => s.trim());
  }

  if (sections.length <= 1) {
    sections = markdown.split(/\n-{3,}\n/).filter((s) => s.trim());
  }

  // Infer page count from bbox refs (page=N)
  if (sections.length <= 1) {
    const pageRefRegex = /page=(\d+)/g;
    let maxPage = 0;
    let m: RegExpExecArray | null;
    while ((m = pageRefRegex.exec(markdown)) !== null) {
      maxPage = Math.max(maxPage, parseInt(m[1], 10));
    }
    const estimatedPages = maxPage > 0 ? maxPage + 1 : 0;
    if (estimatedPages > 1) {
      const charsPerPage = Math.ceil(markdown.length / estimatedPages);
      const lines = markdown.split("\n");
      sections = [];
      let current: string[] = [];
      let currentLen = 0;
      for (const line of lines) {
        current.push(line);
        currentLen += line.length + 1;
        if (currentLen >= charsPerPage && sections.length < estimatedPages - 1) {
          sections.push(current.join("\n"));
          current = [];
          currentLen = 0;
        }
      }
      if (current.length > 0) sections.push(current.join("\n"));
    }
  }

  // Last resort
  if (sections.length <= 1 && markdown.length > 6000) {
    const lines = markdown.split("\n");
    sections = [];
    let current: string[] = [];
    let currentLen = 0;
    for (const line of lines) {
      current.push(line);
      currentLen += line.length + 1;
      if (currentLen >= 3000) {
        sections.push(current.join("\n"));
        current = [];
        currentLen = 0;
      }
    }
    if (current.length > 0) sections.push(current.join("\n"));
  }

  if (sections.length === 0) sections = [markdown];

  return sections.map((section, i) => {
    const images: OcrPage["images"] = [];
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(section)) !== null) {
      images.push({
        altText: match[1] || `Image on page ${i + 1}`,
        url: match[2],
      });
    }
    imageRegex.lastIndex = 0;
    return { pageNumber: i + 1, markdown: section.trim(), images };
  });
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
