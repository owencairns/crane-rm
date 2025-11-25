import pdf from 'pdf-parse';
import crypto from 'crypto';
import { config } from '../config';
import { estimateTokens } from './embedding.service';

export interface ParsedBlock {
  text: string;
  pageNumber: number;
}

export interface ChunkData {
  text: string;
  pageStart: number;
  pageEnd: number;
  sectionPath?: string;
  textHash: string;
}

export async function parsePdf(buffer: Buffer): Promise<{
  blocks: ParsedBlock[];
  pageCount: number;
}> {
  const data = await pdf(buffer);

  const blocks: ParsedBlock[] = [];
  let currentPage = 1;

  // Split by page breaks and process
  const pages = data.text.split('\f'); // Form feed character separates pages

  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i].trim();
    if (pageText.length > 0) {
      blocks.push({
        text: pageText,
        pageNumber: i + 1,
      });
    }
  }

  return {
    blocks,
    pageCount: data.numpages,
  };
}

export function chunkText(blocks: ParsedBlock[]): ChunkData[] {
  const chunks: ChunkData[] = [];
  const maxTokens = config.chunking.maxTokens;
  const overlapTokens = config.chunking.overlapTokens;

  let currentChunk: string[] = [];
  let currentTokens = 0;
  let chunkPageStart = blocks[0]?.pageNumber || 1;
  let chunkPageEnd = blocks[0]?.pageNumber || 1;

  for (const block of blocks) {
    const blockText = block.text;
    const blockTokens = estimateTokens(blockText);

    // If a single block is larger than maxTokens, split it into smaller pieces
    if (blockTokens > maxTokens) {
      // Save current chunk first if it has content
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          text: chunkText,
          pageStart: chunkPageStart,
          pageEnd: chunkPageEnd,
          sectionPath: extractSectionPath(chunkText),
          textHash: hashText(chunkText),
        });
        currentChunk = [];
        currentTokens = 0;
      }

      // Split large block into smaller pieces
      const pieces = splitLargeBlock(blockText, maxTokens, overlapTokens);
      for (const piece of pieces) {
        chunks.push({
          text: piece,
          pageStart: block.pageNumber,
          pageEnd: block.pageNumber,
          sectionPath: extractSectionPath(piece),
          textHash: hashText(piece),
        });
      }

      // Reset for next block
      chunkPageStart = block.pageNumber + 1;
      chunkPageEnd = block.pageNumber + 1;
      continue;
    }

    // Check if we should create semantic boundaries
    const isStructuralBoundary = detectStructuralBoundary(blockText);

    if (
      currentTokens + blockTokens > maxTokens ||
      (isStructuralBoundary && currentTokens > 100)
    ) {
      // Save current chunk
      if (currentChunk.length > 0) {
        const chunkText = currentChunk.join('\n\n');
        chunks.push({
          text: chunkText,
          pageStart: chunkPageStart,
          pageEnd: chunkPageEnd,
          sectionPath: extractSectionPath(chunkText),
          textHash: hashText(chunkText),
        });
      }

      // Start new chunk with overlap
      const overlapText = getOverlapText(currentChunk, overlapTokens);
      currentChunk = overlapText ? [overlapText] : [];
      currentTokens = overlapText ? estimateTokens(overlapText) : 0;
      chunkPageStart = block.pageNumber;
    }

    currentChunk.push(blockText);
    currentTokens += blockTokens;
    chunkPageEnd = block.pageNumber;
  }

  // Save final chunk
  if (currentChunk.length > 0) {
    const chunkText = currentChunk.join('\n\n');
    chunks.push({
      text: chunkText,
      pageStart: chunkPageStart,
      pageEnd: chunkPageEnd,
      sectionPath: extractSectionPath(chunkText),
      textHash: hashText(chunkText),
    });
  }

  return chunks;
}

function splitLargeBlock(
  text: string,
  maxTokens: number,
  overlapTokens: number
): string[] {
  const pieces: string[] = [];
  const lines = text.split('\n');

  let currentPiece: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line);

    // If adding this line would exceed maxTokens, save current piece
    if (currentTokens + lineTokens > maxTokens && currentPiece.length > 0) {
      pieces.push(currentPiece.join('\n'));

      // Start new piece with overlap (last few lines)
      const overlapLines = Math.max(1, Math.floor(overlapTokens / 50)); // Rough estimate
      currentPiece = currentPiece.slice(-overlapLines);
      currentTokens = estimateTokens(currentPiece.join('\n'));
    }

    currentPiece.push(line);
    currentTokens += lineTokens;
  }

  // Add final piece
  if (currentPiece.length > 0) {
    pieces.push(currentPiece.join('\n'));
  }

  return pieces.length > 0 ? pieces : [text]; // Fallback to original text
}

function detectStructuralBoundary(text: string): boolean {
  // Detect common structural markers
  const patterns = [
    /^ARTICLE\s+[IVX0-9]+/i,
    /^SECTION\s+[0-9.]+/i,
    /^\d+\.\s+[A-Z][A-Z\s]+$/m, // Numbered section headers
    /^[A-Z][A-Z\s]{10,}$/m, // All-caps headers
  ];

  return patterns.some((pattern) => pattern.test(text.trim()));
}

function extractSectionPath(text: string): string | undefined {
  // Try to extract section numbering or heading
  const lines = text.split('\n').slice(0, 3); // Check first few lines

  for (const line of lines) {
    const trimmed = line.trim();

    // Match patterns like "SECTION 1.2.3" or "ARTICLE IV"
    const match = trimmed.match(
      /^(ARTICLE|SECTION|PART)\s+([IVX0-9.]+)(.*)$/i
    );
    if (match) {
      return match[0].trim();
    }

    // Match numbered clauses like "1.2.3 Title"
    const numMatch = trimmed.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
    if (numMatch && numMatch[1].length < 20) {
      return numMatch[0].trim();
    }
  }

  return undefined;
}

function getOverlapText(chunks: string[], overlapTokens: number): string {
  if (chunks.length === 0) return '';

  // Take last chunk and trim to overlap size
  const lastChunk = chunks[chunks.length - 1];
  const tokens = estimateTokens(lastChunk);

  if (tokens <= overlapTokens) {
    return lastChunk;
  }

  // Rough character-based trimming
  const targetChars = Math.floor((overlapTokens / tokens) * lastChunk.length);
  return lastChunk.slice(-targetChars);
}

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function generateChunkId(contractId: string, index: number): string {
  return `${contractId}_chunk_${index.toString().padStart(4, '0')}`;
}
