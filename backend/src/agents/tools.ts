import { tool } from 'ai';
import { z } from 'zod';
import {
  getChunk,
  getChunks,
  getAdjacentChunks,
  createFinding,
} from '../services/firebase.service';
import { searchVectors } from '../services/pinecone.service';
import { generateEmbedding } from '../services/embedding.service';
import type {
  SearchChunksResult,
  GetChunkResult,
  ExactFindResult,
  Finding,
} from '../models/types';

interface ToolContext {
  userId: string;
  contractId: string;
  analysisId: string;
}

export function createAgentTools(context: ToolContext) {
  const { userId, contractId, analysisId } = context;

  return {
    // Tool 1: search_chunks - Semantic retrieval
    search_chunks: tool({
      description:
        'Performs semantic search to find relevant chunks in the contract using vector similarity. Returns chunk IDs, page numbers, and text previews.',
      inputSchema: z.object({
        query: z.string().describe('The search query to find relevant sections'),
        topK: z
          .number()
          .optional()
          .default(8)
          .describe('Number of results to return (default: 8)'),
      }),
      execute: async ({ query, topK }) => {
        const queryEmbedding = await generateEmbedding(query);
        const results = await searchVectors(
          queryEmbedding,
          userId,
          contractId,
          topK
        );
        return results;
      },
    }),

    // Tool 2: get_chunk - Fetch full text
    get_chunk: tool({
      description:
        'Retrieves the full text of a specific chunk by its ID. Use this to verify matches and read complete context.',
      inputSchema: z.object({
        chunkId: z.string().describe('The chunk ID to retrieve'),
      }),
      execute: async ({ chunkId }) => {
        const chunk = await getChunk(contractId, chunkId);
        if (!chunk) return null;

        return {
          chunkId: chunk.chunkId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath,
          text: chunk.text,
        };
      },
    }),

    // Tool 3: get_adjacent_chunks - Boundary context
    get_adjacent_chunks: tool({
      description:
        'Retrieves chunks before and after a given chunk ID. Useful when you need more context around a potential match.',
      inputSchema: z.object({
        chunkId: z.string().describe('The reference chunk ID'),
        window: z
          .number()
          .optional()
          .default(1)
          .describe('Number of chunks before/after to retrieve (default: 1)'),
      }),
      execute: async ({ chunkId, window }) => {
        const chunks = await getAdjacentChunks(contractId, chunkId, window);

        return chunks.map((chunk) => ({
          chunkId: chunk.chunkId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionPath: chunk.sectionPath,
          text: chunk.text,
        }));
      },
    }),

    // Tool 4: record_finding - Store result
    record_finding: tool({
      description:
        'Records a finding for a provision after analysis. This stores the result deterministically in the database.',
      inputSchema: z.object({
        provisionId: z.string(),
        priority: z.enum(['critical', 'high', 'medium', 'low']),
        matched: z.boolean(),
        confidence: z.number().min(0).max(1),
        evidenceChunkIds: z.array(z.string()),
        evidencePages: z.array(z.number()),
        evidenceExcerpts: z.array(z.string()),
        reasoningSummary: z.string(),
        recommendedAction: z.string().optional(),
      }),
      execute: async (params) => {
        const finding: Finding = {
          ...params,
          screeningResult: params.matched ? 'analyzed_found' : 'analyzed_not_found',
          createdAt: new Date(),
        };

        await createFinding(contractId, analysisId, params.provisionId, finding);
        return { ok: true };
      },
    }),

    // Tool 4b: record_batch_findings - Store multiple results
    record_batch_findings: tool({
      description:
        'Records multiple findings at once. Use this when analyzing a batch of provisions.',
      inputSchema: z.object({
        findings: z.array(
          z.object({
            provisionId: z.string(),
            priority: z.enum(['critical', 'high', 'medium', 'low']),
            matched: z.boolean(),
            confidence: z.number().min(0).max(1),
            evidenceChunkIds: z.array(z.string()),
            evidencePages: z.array(z.number()),
            evidenceExcerpts: z.array(z.string()),
            reasoningSummary: z.string(),
            recommendedAction: z.string().optional(),
          })
        ),
      }),
      execute: async ({ findings }) => {
        const promises = findings.map((params) => {
          const finding: Finding = {
            ...params,
            screeningResult: params.matched ? 'analyzed_found' : 'analyzed_not_found',
            createdAt: new Date(),
          };
          return createFinding(contractId, analysisId, params.provisionId, finding);
        });

        await Promise.all(promises);
        return { ok: true, count: findings.length };
      },
    }),

    // Tool 5: exact_find - Keyword/regex fallback
    exact_find: tool({
      description:
        'Performs exact keyword or pattern matching across all chunks. Useful for finding specific terms like "liquidated damages" or "OCIP".',
      inputSchema: z.object({
        patterns: z
          .array(z.string())
          .describe('Array of keywords or patterns to search for'),
      }),
      execute: async ({ patterns }) => {
        const chunks = await getChunks(contractId);
        const matches: ExactFindResult['matches'] = [];

        for (const chunk of chunks) {
          const lowerText = chunk.text.toLowerCase();

          for (const pattern of patterns) {
            const lowerPattern = pattern.toLowerCase();

            if (lowerText.includes(lowerPattern)) {
              // Find the actual occurrence for context
              const index = lowerText.indexOf(lowerPattern);
              const snippetStart = Math.max(0, index - 50);
              const snippetEnd = Math.min(chunk.text.length, index + pattern.length + 50);
              const snippet = chunk.text.slice(snippetStart, snippetEnd);

              matches.push({
                chunkId: chunk.chunkId,
                page: chunk.pageStart,
                snippet: `...${snippet}...`,
                pattern,
              });
            }
          }
        }

        return { matches };
      },
    }),
  };
}
