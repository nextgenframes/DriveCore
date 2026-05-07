// Resolve the AI endpoint + auth at call time so operators can point the app
// at Lovable AI Gateway, a self-hosted Ollama/vLLM, or any OpenAI-compatible
// server without code changes.
//
// Env vars:
//   AI_BASE_URL    e.g. "http://localhost:11434/v1" (Ollama) or
//                  "http://127.0.0.1:8000/v1" (vLLM). Defaults to Lovable AI.
//   AI_API_KEY     Bearer token. Falls back to LOVABLE_API_KEY. Optional for
//                  local servers that don't require auth.
//   AI_MODEL       Optional default model override (e.g. "llama3.1:70b").

const DEFAULT_BASE_URL = "https://ai.gateway.lovable.dev/v1";

export function getAIConfig() {
  const baseUrl = (process.env.AI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const apiKey = process.env.AI_API_KEY ?? process.env.LOVABLE_API_KEY ?? "";
  const defaultModel = process.env.AI_MODEL;
  const isLovable = baseUrl === DEFAULT_BASE_URL;
  if (isLovable && !apiKey) {
    throw new Error("LOVABLE_API_KEY not configured (or set AI_BASE_URL + AI_API_KEY for a self-hosted model).");
  }
  return { baseUrl, apiKey, defaultModel, isLovable };
}

export function aiChatCompletionsUrl(): string {
  return `${getAIConfig().baseUrl}/chat/completions`;
}

export function aiAuthHeaders(): Record<string, string> {
  const { apiKey } = getAIConfig();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export function resolveModel(requested: string): string {
  const { defaultModel } = getAIConfig();
  return defaultModel ?? requested;
}
