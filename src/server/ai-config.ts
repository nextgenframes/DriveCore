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

function isTransientAiStatus(status: number) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function extractFetchDetail(error: unknown) {
  const e = error as {
    message?: string;
    cause?: { message?: string; code?: string };
  };
  return e?.cause?.message || e?.cause?.code || e?.message || "Unknown network error";
}

export async function fetchAIWithFallback(
  body: string,
  requestedModel: string,
  label: string,
  userId?: string | null,
) {
  const config = getAIConfig();
  const model = resolveModel(requestedModel);
  const endpoints = [config.baseUrl];

  if (config.baseUrl !== DEFAULT_BASE_URL && process.env.LOVABLE_API_KEY) {
    endpoints.push(DEFAULT_BASE_URL);
  }

  let lastError: unknown;
  let lastStatusResponse: Response | null = null;
  let totalAttempts = 0;
  let usedFallbackFinal = false;
  let endpointFinal = `${config.baseUrl}/chat/completions`;
  const startedAt = Date.now();

  const finalize = async (
    response: Response | null,
    error: unknown,
  ) => {
    const duration = Date.now() - startedAt;
    const status = response?.status ?? null;
    const ok = !!response?.ok;
    let errorText: string | null = null;
    if (!ok) {
      if (error) errorText = extractFetchDetail(error);
      else if (response) {
        try {
          const cloned = response.clone();
          errorText = (await cloned.text()).slice(0, 500);
        } catch {
          errorText = `HTTP ${response.status}`;
        }
      }
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("ai_call_logs").insert({
        user_id: userId ?? null,
        label,
        requested_model: requestedModel,
        resolved_model: model,
        endpoint: endpointFinal,
        base_url: usedFallbackFinal ? DEFAULT_BASE_URL : config.baseUrl,
        used_fallback: usedFallbackFinal,
        status_code: status,
        ok,
        attempts: totalAttempts,
        duration_ms: duration,
        error: errorText,
      });
    } catch (logErr) {
      console.error(`[${label}] Failed to record ai_call_logs entry:`, logErr);
    }
  };

  for (const baseUrl of endpoints) {
    const usingFallback = baseUrl !== config.baseUrl;
    const headers = {
      "Content-Type": "application/json",
      ...(baseUrl === DEFAULT_BASE_URL
        ? { Authorization: `Bearer ${process.env.LOVABLE_API_KEY ?? ""}` }
        : aiAuthHeaders()),
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      totalAttempts++;
      usedFallbackFinal = usingFallback;
      endpointFinal = `${baseUrl}/chat/completions`;
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            ...JSON.parse(body),
            model,
          }),
        });

        if (!response.ok && isTransientAiStatus(response.status) && attempt < 2) {
          console.error(`[${label}] AI request returned ${response.status} on attempt ${attempt + 1}${usingFallback ? " (fallback gateway)" : ""}`);
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          lastStatusResponse = response;
        }

        await finalize(response, null);
        return response;
      } catch (error) {
        lastError = error;
        console.error(
          `[${label}] AI fetch attempt ${attempt + 1} failed${usingFallback ? " (fallback gateway)" : ""}:`,
          extractFetchDetail(error),
        );

        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
    }
  }

  if (lastStatusResponse) {
    await finalize(lastStatusResponse, null);
    return lastStatusResponse;
  }

  await finalize(null, lastError);
  const detail = extractFetchDetail(lastError);
  throw new Error(`Could not reach the analysis service: ${detail}. Try again in a moment.`);
}
