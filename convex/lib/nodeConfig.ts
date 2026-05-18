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
    zai: {
      apiKey: requiredEnv("ZAI_API_KEY"),
    },
    openai: {
      apiKey: requiredEnv("OPENAI_API_KEY"),
      analysisModel: process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini",
    },
  };
}
