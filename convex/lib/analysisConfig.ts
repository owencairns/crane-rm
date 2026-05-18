export const analysisConfig = {
  llm: {
    maxSteps: 500,
  },
  catalogVersion: "3.0.0",
  chunking: {
    maxChars: 8000,
    overlapChars: 500,
  },
} as const;
