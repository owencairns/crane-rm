import { generateEmbedding, generateEmbeddingsBatch } from './embedding.service';
import { searchVectors } from './pinecone.service';
import { getChunks } from './firebase.service';
import { getProvisionCatalog } from './provision.service';
import { analysisConfig } from '../config/analysis.config';
import type {
  Provision,
  CandidateChunk,
  CandidateMap,
  ProvisionEmbeddings,
  ProvisionEmbeddingCache,
  Chunk,
} from '../models/types';

// In-memory cache for provision embeddings
let provisionEmbeddingCache: ProvisionEmbeddingCache = {};
let cacheInitialized = false;

/**
 * Initialize provision embeddings at server startup.
 * Generates embeddings for canonical wording, synonyms, and search queries.
 */
export async function initializeProvisionEmbeddings(): Promise<void> {
  const provisions = getProvisionCatalog();
  console.log(`Generating embeddings for ${provisions.length} provisions...`);

  // Collect all texts that need embedding
  const embeddingTasks: { provisionId: string; type: string; index: number; text: string }[] = [];

  for (const provision of provisions) {
    // Canonical wording
    embeddingTasks.push({
      provisionId: provision.provisionId,
      type: 'canonical',
      index: 0,
      text: provision.canonicalWording,
    });

    // Synonyms
    provision.synonyms.forEach((synonym, idx) => {
      embeddingTasks.push({
        provisionId: provision.provisionId,
        type: 'synonym',
        index: idx,
        text: synonym,
      });
    });

    // Search queries (if defined)
    if (provision.searchQueries) {
      provision.searchQueries.forEach((query, idx) => {
        embeddingTasks.push({
          provisionId: provision.provisionId,
          type: 'searchQuery',
          index: idx,
          text: query,
        });
      });
    }
  }

  // Batch generate embeddings (OpenAI supports batch requests)
  const batchSize = 100;
  const allTexts = embeddingTasks.map((t) => t.text);
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < allTexts.length; i += batchSize) {
    const batch = allTexts.slice(i, i + batchSize);
    const embeddings = await generateEmbeddingsBatch(batch);
    allEmbeddings.push(...embeddings);
    console.log(`  Embedded ${Math.min(i + batchSize, allTexts.length)}/${allTexts.length} texts`);
  }

  // Organize embeddings by provision
  const cache: ProvisionEmbeddingCache = {};

  for (let i = 0; i < embeddingTasks.length; i++) {
    const task = embeddingTasks[i];
    const embedding = allEmbeddings[i];

    if (!cache[task.provisionId]) {
      cache[task.provisionId] = {
        canonical: [],
        synonyms: [],
        searchQueries: [],
      };
    }

    if (task.type === 'canonical') {
      cache[task.provisionId].canonical = embedding;
    } else if (task.type === 'synonym') {
      cache[task.provisionId].synonyms[task.index] = embedding;
    } else if (task.type === 'searchQuery') {
      cache[task.provisionId].searchQueries[task.index] = embedding;
    }
  }

  provisionEmbeddingCache = cache;
  cacheInitialized = true;
  console.log(`Provision embeddings cached for ${Object.keys(cache).length} provisions`);
}

/**
 * Get cached embeddings for a provision.
 */
export function getProvisionEmbeddings(provisionId: string): ProvisionEmbeddings | undefined {
  return provisionEmbeddingCache[provisionId];
}

/**
 * Check if the embedding cache is initialized.
 */
export function isEmbeddingCacheReady(): boolean {
  return cacheInitialized;
}

/**
 * Find candidate chunks for all provisions using vector similarity.
 * This is the core pre-screening function.
 */
export async function findCandidatesForAllProvisions(
  userId: string,
  contractId: string,
  provisions: Provision[]
): Promise<CandidateMap> {
  if (!cacheInitialized) {
    throw new Error('Provision embeddings not initialized. Call initializeProvisionEmbeddings() first.');
  }

  const { vectorSimilarityThreshold, topKPerProvision, topKPerSynonym } = analysisConfig.prescreening;
  const candidateMap: CandidateMap = {};

  // Process each provision
  for (const provision of provisions) {
    const provisionEmbeddings = provisionEmbeddingCache[provision.provisionId];
    if (!provisionEmbeddings) {
      console.warn(`No cached embeddings for provision: ${provision.provisionId}`);
      candidateMap[provision.provisionId] = [];
      continue;
    }

    const allCandidates: Map<string, CandidateChunk> = new Map();

    // Search with canonical embedding
    const canonicalResults = await searchVectors(
      provisionEmbeddings.canonical,
      userId,
      contractId,
      topKPerProvision
    );

    for (const result of canonicalResults) {
      if (result.score >= vectorSimilarityThreshold) {
        allCandidates.set(result.chunkId, {
          chunkId: result.chunkId,
          pageStart: result.pageStart,
          pageEnd: result.pageEnd,
          score: result.score,
          text: '', // Will be populated later
          matchType: 'vector',
        });
      }
    }

    // Search with synonym embeddings
    for (const synonymEmbedding of provisionEmbeddings.synonyms) {
      const synonymResults = await searchVectors(
        synonymEmbedding,
        userId,
        contractId,
        topKPerSynonym
      );

      for (const result of synonymResults) {
        if (result.score >= vectorSimilarityThreshold) {
          const existing = allCandidates.get(result.chunkId);
          if (existing) {
            // Keep higher score
            if (result.score > existing.score) {
              existing.score = result.score;
            }
          } else {
            allCandidates.set(result.chunkId, {
              chunkId: result.chunkId,
              pageStart: result.pageStart,
              pageEnd: result.pageEnd,
              score: result.score,
              text: '',
              matchType: 'vector',
            });
          }
        }
      }
    }

    // Search with searchQuery embeddings (if available)
    for (const queryEmbedding of provisionEmbeddings.searchQueries) {
      const queryResults = await searchVectors(
        queryEmbedding,
        userId,
        contractId,
        topKPerSynonym
      );

      for (const result of queryResults) {
        if (result.score >= vectorSimilarityThreshold) {
          const existing = allCandidates.get(result.chunkId);
          if (existing) {
            if (result.score > existing.score) {
              existing.score = result.score;
            }
          } else {
            allCandidates.set(result.chunkId, {
              chunkId: result.chunkId,
              pageStart: result.pageStart,
              pageEnd: result.pageEnd,
              score: result.score,
              text: '',
              matchType: 'vector',
            });
          }
        }
      }
    }

    // Convert map to array, sorted by score descending
    const candidates = Array.from(allCandidates.values()).sort((a, b) => b.score - a.score);

    // Limit to topKPerProvision
    candidateMap[provision.provisionId] = candidates.slice(0, topKPerProvision);
  }

  // Fetch full text for all candidate chunks
  await populateCandidateTexts(contractId, candidateMap);

  return candidateMap;
}

/**
 * Run exact keyword matching across all chunks for all provisions.
 */
export async function runExactKeywordSearch(
  contractId: string,
  provisions: Provision[]
): Promise<CandidateMap> {
  const chunks = await getChunks(contractId);
  const candidateMap: CandidateMap = {};

  for (const provision of provisions) {
    const candidates: Map<string, CandidateChunk> = new Map();

    // Get patterns to search for
    const patterns = getSearchPatterns(provision);

    for (const chunk of chunks) {
      const lowerText = chunk.text.toLowerCase();
      const matchedPatterns: string[] = [];

      for (const pattern of patterns) {
        if (lowerText.includes(pattern.toLowerCase())) {
          matchedPatterns.push(pattern);
        }
      }

      if (matchedPatterns.length > 0) {
        candidates.set(chunk.chunkId, {
          chunkId: chunk.chunkId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          score: 0.7 + matchedPatterns.length * 0.05, // Base score + bonus per pattern
          text: chunk.text,
          matchType: 'keyword',
          keywordMatches: matchedPatterns,
        });
      }
    }

    candidateMap[provision.provisionId] = Array.from(candidates.values());
  }

  return candidateMap;
}

/**
 * Get search patterns for a provision (exactPatterns, synonyms, canonical words).
 */
function getSearchPatterns(provision: Provision): string[] {
  const patterns: string[] = [];

  // Use exactPatterns if defined
  if (provision.exactPatterns && provision.exactPatterns.length > 0) {
    patterns.push(...provision.exactPatterns);
  } else {
    // Fall back to synonyms and key words from canonical wording
    patterns.push(...provision.synonyms);

    // Extract key phrases from canonical wording (simple approach)
    const canonicalWords = provision.canonicalWording
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4); // Only words > 4 chars
    if (canonicalWords.length > 0) {
      patterns.push(provision.canonicalWording.toLowerCase());
    }
  }

  return patterns;
}

/**
 * Merge vector similarity candidates with keyword match candidates.
 * Candidates found by both methods get matchType: 'both' and higher confidence.
 */
export function mergeCandidates(
  vectorCandidates: CandidateMap,
  keywordCandidates: CandidateMap
): CandidateMap {
  const merged: CandidateMap = {};

  // Get all provision IDs from both maps
  const allProvisionIds = new Set([
    ...Object.keys(vectorCandidates),
    ...Object.keys(keywordCandidates),
  ]);

  for (const provisionId of allProvisionIds) {
    const vectorChunks = vectorCandidates[provisionId] || [];
    const keywordChunks = keywordCandidates[provisionId] || [];

    const mergedMap = new Map<string, CandidateChunk>();

    // Add vector candidates
    for (const chunk of vectorChunks) {
      mergedMap.set(chunk.chunkId, { ...chunk });
    }

    // Merge keyword candidates
    for (const keywordChunk of keywordChunks) {
      const existing = mergedMap.get(keywordChunk.chunkId);

      if (existing) {
        // Found in both - boost score and mark as 'both'
        existing.matchType = 'both';
        existing.score = Math.min(1.0, existing.score + 0.1); // Boost score
        existing.keywordMatches = keywordChunk.keywordMatches;
        // Keep the text from keyword (it's already populated)
        if (!existing.text && keywordChunk.text) {
          existing.text = keywordChunk.text;
        }
      } else {
        // Only found via keyword
        mergedMap.set(keywordChunk.chunkId, { ...keywordChunk });
      }
    }

    // Sort by score and convert to array
    merged[provisionId] = Array.from(mergedMap.values()).sort((a, b) => b.score - a.score);
  }

  return merged;
}

/**
 * Populate candidate chunks with full text from Firestore.
 */
async function populateCandidateTexts(
  contractId: string,
  candidateMap: CandidateMap
): Promise<void> {
  // Collect all unique chunk IDs that need text
  const chunkIdsNeedingText = new Set<string>();

  for (const candidates of Object.values(candidateMap)) {
    for (const candidate of candidates) {
      if (!candidate.text) {
        chunkIdsNeedingText.add(candidate.chunkId);
      }
    }
  }

  if (chunkIdsNeedingText.size === 0) return;

  // Fetch chunks from Firestore
  const chunks = await getChunks(contractId, Array.from(chunkIdsNeedingText));
  const chunkMap = new Map<string, Chunk>();
  for (const chunk of chunks) {
    chunkMap.set(chunk.chunkId, chunk);
  }

  // Populate text in candidates
  for (const candidates of Object.values(candidateMap)) {
    for (const candidate of candidates) {
      if (!candidate.text) {
        const chunk = chunkMap.get(candidate.chunkId);
        if (chunk) {
          candidate.text = chunk.text;
        }
      }
    }
  }
}

/**
 * Run full pre-screening: vector similarity + keyword matching + merge.
 */
export async function runPreScreening(
  userId: string,
  contractId: string,
  provisions: Provision[]
): Promise<CandidateMap> {
  console.log(`Running pre-screening for ${provisions.length} provisions...`);

  // Run vector and keyword search in parallel
  const [vectorCandidates, keywordCandidates] = await Promise.all([
    findCandidatesForAllProvisions(userId, contractId, provisions),
    runExactKeywordSearch(contractId, provisions),
  ]);

  // Merge results
  const merged = mergeCandidates(vectorCandidates, keywordCandidates);

  // Log summary
  let totalCandidates = 0;
  let provisionsWithCandidates = 0;

  for (const [provisionId, candidates] of Object.entries(merged)) {
    totalCandidates += candidates.length;
    if (candidates.length > 0) provisionsWithCandidates++;
  }

  console.log(
    `Pre-screening complete: ${provisionsWithCandidates}/${provisions.length} provisions have candidates (${totalCandidates} total chunks)`
  );

  return merged;
}

/**
 * Partition provisions into those with candidates and those without.
 */
export function partitionProvisions(
  provisions: Provision[],
  candidateMap: CandidateMap
): { withCandidates: Provision[]; withoutCandidates: Provision[] } {
  const minCandidates = analysisConfig.batching.minCandidatesForLLM;

  const withCandidates: Provision[] = [];
  const withoutCandidates: Provision[] = [];

  for (const provision of provisions) {
    const candidates = candidateMap[provision.provisionId] || [];
    if (candidates.length >= minCandidates) {
      withCandidates.push(provision);
    } else {
      withoutCandidates.push(provision);
    }
  }

  return { withCandidates, withoutCandidates };
}
