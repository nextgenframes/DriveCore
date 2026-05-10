import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://lablab-ai-amd-developer-hackathon-drivecore.hf.space";

async function callQwen(input: string): Promise<string> {
  const resp = await fetch(`${AI_BASE_URL}/branch-debug`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
  const json = await resp.json();
  return json.output ?? "No analysis returned.";
}

const InputSchema = z.object({ diff: z.string().min(1).max(200_000), failureDescription: z.string().min(1).max(5_000) });
const SnippetInputSchema = z.object({ snippet: z.string().min(1).max(200_000), failureDescription: z.string().min(1).max(5_000), language: z.string().max(40).optional() });

export type Suspect = { filePath: string; functionName: string | null; lineStart: number; lineEnd: number; confidence: "high" | "medium" | "low"; mechanism: string; changeSummary: string; beforeSnippet: string | null; afterSnippet: string | null; };
export type DebugResult = { suspects: Suspect[]; summary: string; sanitizationStats: { identifiersTokenized: number; commentsStripped: number; secretsBlocked: number }; audit: { tokenMap: { token: string; real: string; occurrences: number }[]; redactedComments: string[]; secretMatches: { pattern: string; replaced: string }[]; sample: { original: string; sanitized: string } }; };

export const debugBranch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<DebugResult> => {
    const summary = await callQwen(`Git diff:\n${data.diff}\n\nFailure description:\n${data.failureDescription}`);
    return { summary, suspects: [{ filePath: "see-report", functionName: null, lineStart: 1, lineEnd: 1, confidence: "high", mechanism: summary, changeSummary: "Qwen AutoPulse Bot analysis complete", beforeSnippet: null, afterSnippet: null }], sanitizationStats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 }, audit: { tokenMap: [], redactedComments: [], secretMatches: [], sample: { original: data.diff.slice(0, 500), sanitized: data.diff.slice(0, 500) } } };
  });

export const debugSnippet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SnippetInputSchema.parse(d))
  .handler(async ({ data }): Promise<DebugResult> => {
    const summary = await callQwen(`Code snippet (${data.language ?? "unknown"}):\n${data.snippet}\n\nFailure description:\n${data.failureDescription}`);
    return { summary, suspects: [{ filePath: `snippet.${data.language ?? "code"}`, functionName: null, lineStart: 1, lineEnd: 1, confidence: "high", mechanism: summary, changeSummary: "Qwen AutoPulse Bot snippet analysis complete", beforeSnippet: null, afterSnippet: data.snippet.slice(0, 200) }], sanitizationStats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 }, audit: { tokenMap: [], redactedComments: [], secretMatches: [], sample: { original: data.snippet.slice(0, 500), sanitized: data.snippet.slice(0, 500) } } };
  });

export async function analyzeDiff(diff: string, failureDescription: string): Promise<DebugResult> {
  const summary = await callQwen(`Git diff:\n${diff}\n\nFailure description:\n${failureDescription}`);
  return { summary, suspects: [], sanitizationStats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 }, audit: { tokenMap: [], redactedComments: [], secretMatches: [], sample: { original: diff.slice(0, 500), sanitized: diff.slice(0, 500) } } };
}

export async function analyzeSnippet(snippet: string, failureDescription: string, language?: string): Promise<DebugResult> {
  const summary = await callQwen(`Code snippet (${language ?? "unknown"}):\n${snippet}\n\nFailure description:\n${failureDescription}`);
  return { summary, suspects: [], sanitizationStats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 }, audit: { tokenMap: [], redactedComments: [], secretMatches: [], sample: { original: snippet.slice(0, 500), sanitized: snippet.slice(0, 500) } } };
}

export function sanitize(text: string) {
  return { sanitized: text, reverseMap: new Map<string, string>(), stats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 }, audit: { tokenMap: [], redactedComments: [], secretMatches: [], sample: { original: text.slice(0, 500), sanitized: text.slice(0, 500) } } };
}

export function restore(text: string, reverseMap: Map<string, string>): string { return text; }
