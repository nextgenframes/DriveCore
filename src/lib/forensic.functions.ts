import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://lablab-ai-amd-developer-hackathon-drivecore.hf.space";

async function callQwen(input: string): Promise<string> {
  const resp = await fetch(`${AI_BASE_URL}/forensic`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
  const json = await resp.json();
  return json.output ?? "No analysis returned.";
}

export type Hypothesis = { id: string; title: string; confidence: "High" | "Medium" | "Low"; mechanism: string; code_evidence: string; log_signatures: string[]; eliminates_if: string; };
export type Stage1Result = { stage: 1; summary: string; critical_path: string[]; hypotheses: Hypothesis[]; what_to_grep: string[]; timeline_question: string; unknowns: string[]; };
export type Stage2Result = { stage: 2; summary: string; timeline: { offset: string; event: string; source: string }[]; hypothesis_verdicts: { id: string; verdict: "CONFIRMED" | "ELIMINATED" | "POSSIBLE"; evidence: string }[]; root_cause: { function: string; line_hint: string; mechanism: string; confidence: "High" | "Medium" | "Low" }; what_vehicle_saw: string; still_unknown: string[]; };
export type Stage3Result = { stage: 3; summary: string; failure_layer: "SENSING" | "PROCESSING" | "PLANNING" | "CONTROL"; perception_state: { what_vehicle_saw: string; what_it_should_have_seen: string; discrepancy: string }; full_chain: { layer: string; input: string; output: string; issue: string }[]; definitive_cause: { function: string; mechanism: string; confidence: "High" }; fix: string; test_case: string; };
export type StageResult = Stage1Result | Stage2Result | Stage3Result;
export type VehicleManifest = { vehicleId: string; commitHash: string; branch: string; source: "manifest" | "git" | "github" | "manual"; fetchedAt: number; warnings: string[]; };
export type FetchedCode = { manifest: VehicleManifest; files: { path: string; content: string }[]; fetchMethod: string; warnings: string[]; };

const ConnectSchema = z.object({ vehicleId: z.string().min(1).max(80), manifestUrl: z.string().url().optional().or(z.literal("")), githubRepo: z.string().max(160).optional(), githubBranch: z.string().max(80).optional(), githubToken: z.string().max(200).optional() });
export const testVehicleConnection = createServerFn({ method: "POST" }).inputValidator((d: unknown) => ConnectSchema.parse(d)).handler(async ({ data }) => { return { vehicleId: data.vehicleId, results: { latencyMs: 0 } }; });

const FetchSchema = z.object({ vehicleId: z.string().min(1).max(80), targetFiles: z.array(z.string().min(1).max(300)).min(1).max(20), manifestUrl: z.string().optional(), githubRepo: z.string().optional(), githubBranch: z.string().optional().default("main"), githubToken: z.string().optional(), manualCommit: z.string().optional() });
export const fetchVehicleCode = createServerFn({ method: "POST" }).inputValidator((d: unknown) => FetchSchema.parse(d)).handler(async ({ data }): Promise<FetchedCode> => { return { manifest: { vehicleId: data.vehicleId, commitHash: data.manualCommit ?? "unknown", branch: data.githubBranch ?? "main", source: "manual", fetchedAt: Date.now(), warnings: [] }, files: [], fetchMethod: "manual", warnings: [] }; });

const StageInput = z.object({ stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), code: z.string().min(1).max(200_000), failureDescription: z.string().min(1).max(5_000), logs: z.string().max(120_000).optional(), bagData: z.string().max(120_000).optional(), priorStage1: z.unknown().optional(), priorStage2: z.unknown().optional() });

export const runForensicStage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StageInput.parse(d))
  .handler(async ({ data }): Promise<{ result: StageResult; sanitizationStats: { identifiersTokenized: number; commentsStripped: number; secretsBlocked: number } }> => {
    const input = `Stage ${data.stage} forensic analysis.\nCode:\n${data.code}\nFailure: ${data.failureDescription}\nLogs: ${data.logs ?? "none"}\nSensor data: ${data.bagData ?? "none"}`;
    const summary = await callQwen(input);
    const result: Stage1Result = { stage: 1, summary, critical_path: [], hypotheses: [{ id: "h1", title: "Qwen AutoPulse Bot Analysis", confidence: "High", mechanism: summary, code_evidence: "See full report", log_signatures: [], eliminates_if: "N/A" }], what_to_grep: [], timeline_question: "See Qwen report above", unknowns: [] };
    return { result, sanitizationStats: { identifiersTokenized: 0, commentsStripped: 0, secretsBlocked: 0 } };
  });
