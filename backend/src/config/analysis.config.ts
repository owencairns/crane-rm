// Analysis pipeline configuration
// Centralized settings for pre-screening and LLM verification

export const analysisConfig = {
  prescreening: {
    // Minimum cosine similarity to consider a chunk as a candidate
    vectorSimilarityThreshold: 0.65,

    // Max candidate chunks per provision from vector search
    topKPerProvision: 5,

    // Max candidate chunks per synonym query
    topKPerSynonym: 3,

    // Always include exact keyword matches regardless of vector score
    alwaysIncludeExactMatches: true,
  },

  llm: {
    // Model for verification pass (Gemini 3 Flash - 1M context, 3x faster than 2.5 Pro)
    model: 'gemini-3-flash-preview',

    // Maximum concurrent batch processing
    maxConcurrentBatches: 3,

    // Step limits per priority level
    stepLimits: {
      critical: 60,
      high: 30,
      medium: 30,
      low: 20,
    },

    // Default step limit for mixed batches
    defaultStepLimit: 40,
  },

  batching: {
    // Maximum provisions per LLM batch (to avoid context overflow)
    maxProvisionsPerBatch: 15,

    // Minimum candidates to send provision to LLM (otherwise auto-not-found)
    minCandidatesForLLM: 1,
  },

  timeouts: {
    // Max time for pre-screening pass (ms)
    prescreening: 30000,

    // Max time per LLM batch (ms)
    batchProcessing: 120000,

    // Max total analysis time (ms) - 5 minutes
    totalAnalysis: 300000,
  },

  // Feature flags for gradual rollout
  features: {
    enableTwoPassAnalysis: true,
    enableParallelBatches: true,
    enableProvisionClusters: true,
    enableAutoNotFound: true,
  },
};

export type AnalysisConfig = typeof analysisConfig;
