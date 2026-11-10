"use node";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getNodeConfig() {
  return {
    mistral: {
      apiKey: requiredEnv("MISTRAL_API_KEY"),
    },
    openai: {
      apiKey: requiredEnv("OPENAI_API_KEY"),
      analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini",
      coiOverseerModel:
        process.env.OPENAI_COI_OVERSEER_MODEL ||
        process.env.OPENAI_ANALYSIS_MODEL ||
        "gpt-5.4-mini",
    },
  };
}
