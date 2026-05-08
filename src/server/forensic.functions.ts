import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sanitize, restore } from "./branch-debug.functions";
import { fetchAIWithFallback, getAIConfig } from "./ai-config";

// ───────────────────────── SSRF Guard ─────────────────────────
// Reject loopback, private (RFC1918), link-local, and cloud metadata addresses
// before any server-side fetch of a user-supplied URL.
function assertSafePublicUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Response("Invalid URL", { status: 400 }); }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Response("Only http(s) URLs are allowed", { status: 400 });
  }
  const host = u.hostname.toLowerCase();
  // Block obvious literals
  const blockedHosts = new Set([
    "localhost", "127.0.0.1", "0.0.0.0", "::1",
    "169.254.169.254", "metadata.google.internal", "metadata.goog",
  ]);
  if (blockedHosts.has(host)) throw new Response("Host not allowed", { status: 400 });
  // Block IPv4 private/reserved ranges
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      a >= 224 // multicast/reserved
    ) throw new Response("Private/reserved IP not allowed", { status: 400 });
  }
  // Block IPv6 loopback / link-local / unique-local
  if (host.includes(":")) {
    if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
      throw new Response("Private IPv6 not allowed", { status: 400 });
    }
  }
  return u;
}

// ───────────────────────── Types ─────────────────────────

export type VehicleManifest = {
  vehicleId: string;
  commitHash: string;
  branch: string;
  source: "manifest" | "git" | "github" | "manual";
  fetchedAt: number;
  warnings: string[];
};

export type FetchedCode = {
  manifest: VehicleManifest;
  files: { path: string; content: string }[];
  fetchMethod: string;
  warnings: string[];
};

export type Hypothesis = {
  id: string;
  title: string;
  confidence: "High" | "Medium" | "Low";
  mechanism: string;
  code_evidence: string;
  log_signatures: string[];
  eliminates_if: string;
};

export type Stage1Result = {
  stage: 1;
  summary: string;
  critical_path: string[];
  hypotheses: Hypothesis[];
  what_to_grep: string[];
  timeline_question: string;
  unknowns: string[];
};

export type Stage2Result = {
  stage: 2;
  summary: string;
  timeline: { offset: string; event: string; source: string }[];
  hypothesis_verdicts: { id: string; verdict: "CONFIRMED" | "ELIMINATED" | "POSSIBLE"; evidence: string }[];
  root_cause: { function: string; line_hint: string; mechanism: string; confidence: "High" | "Medium" | "Low" };
  what_vehicle_saw: string;
  still_unknown: string[];
};

export type Stage3Result = {
  stage: 3;
  summary: string;
  failure_layer: "SENSING" | "PROCESSING" | "PLANNING" | "CONTROL";
  perception_state: { what_vehicle_saw: string; what_it_should_have_seen: string; discrepancy: string };
  full_chain: { layer: string; input: string; output: string; issue: string }[];
  definitive_cause: { function: string; mechanism: string; confidence: "High" };
  fix: string;
  test_case: string;
};

export type StageResult = Stage1Result | Stage2Result | Stage3Result;

// ───────────────────────── Connect / Fetch ─────────────────────────
//
// The Worker runtime cannot SSH. Two real fetch strategies work here:
//   1. Central manifest endpoint (HTTP GET)  – vehicles push build info on startup
//   2. GitHub raw / API (HTTP)               – fetch exact files at the manifest commit
// SSH-into-vehicle is intentionally surfaced as "agent required" to the user.

const ConnectSchema = z.object({
  vehicleId: z.string().min(1).max(80),
  manifestUrl: z.string().url().optional().or(z.literal("")),
  githubRepo: z.string().max(160).optional(), // "org/repo"
  githubBranch: z.string().max(80).optional(),
  githubToken: z.string().max(200).optional(),
});

export const testVehicleConnection = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ConnectSchema.parse(d))
  .handler(async ({ data }) => {
    const results: Record<string, any> = {};
    const t0 = Date.now();

    if (data.manifestUrl) {
      try {
        assertSafePublicUrl(data.manifestUrl);
        const url = `${data.manifestUrl.replace(/\/$/, "")}/vehicles/${encodeURIComponent(data.vehicleId)}/manifest`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        results.manifestReachable = res.ok;
        results.manifestStatus = res.status;
        if (res.ok) {
          const m = await res.json().catch(() => null);
          if (m && typeof m === "object") {
            // Only reflect known typed fields back to caller
            const commit = (m as any).commit;
            const branch = (m as any).branch;
            results.deployedCommit = typeof commit === "string" ? commit.slice(0, 80) : null;
            results.branch = typeof branch === "string" ? branch.slice(0, 80) : null;
          }
        }
      } catch (e) {
        results.manifestReachable = false;
        results.manifestError = (e as Error).message;
      }
    }

    if (data.githubRepo) {
      try {
        const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
        if (data.githubToken) headers.Authorization = `Bearer ${data.githubToken}`;
        const r = await fetch(`https://api.github.com/repos/${data.githubRepo}`, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        results.githubReachable = r.ok;
        results.githubStatus = r.status;
      } catch (e) {
        results.githubReachable = false;
        results.githubError = (e as Error).message;
      }
    }

    results.latencyMs = Date.now() - t0;
    return { vehicleId: data.vehicleId, results };
  });

const FetchSchema = z.object({
  vehicleId: z.string().min(1).max(80),
  targetFiles: z.array(z.string().min(1).max(300)).min(1).max(20),
  manifestUrl: z.string().optional(),
  githubRepo: z.string().optional(), // "org/repo"
  githubBranch: z.string().optional().default("main"),
  githubToken: z.string().optional(),
  manualCommit: z.string().optional(), // override commit when no manifest
});

export const fetchVehicleCode = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => FetchSchema.parse(d))
  .handler(async ({ data }): Promise<FetchedCode> => {
    const warnings: string[] = [];
    let commit = data.manualCommit?.trim() || "";
    let branch = data.githubBranch || "main";
    let source: VehicleManifest["source"] = "manual";

    // Strategy 1: manifest endpoint
    if (!commit && data.manifestUrl) {
      try {
        assertSafePublicUrl(data.manifestUrl);
        const url = `${data.manifestUrl.replace(/\/$/, "")}/vehicles/${encodeURIComponent(data.vehicleId)}/manifest`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (r.ok) {
          const m = (await r.json()) as { commit?: string; branch?: string };
          if (m.commit) {
            commit = m.commit;
            branch = m.branch || branch;
            source = "manifest";
          }
        } else {
          warnings.push(`Manifest endpoint returned ${r.status}`);
        }
      } catch (e) {
        warnings.push(`Manifest fetch failed: ${(e as Error).message}`);
      }
    }

    // If still no commit, fall back to branch HEAD via GitHub
    if (!commit && data.githubRepo) {
      try {
        const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
        if (data.githubToken) headers.Authorization = `Bearer ${data.githubToken}`;
        const r = await fetch(
          `https://api.github.com/repos/${data.githubRepo}/commits/${encodeURIComponent(branch)}`,
          { headers, signal: AbortSignal.timeout(8000) },
        );
        if (r.ok) {
          const j = (await r.json()) as { sha?: string };
          if (j.sha) {
            commit = j.sha;
            source = "github";
            warnings.push(`No manifest — fell back to ${branch} HEAD on GitHub`);
          }
        } else {
          const body = await r.text().catch(() => "");
          warnings.push(
            `GitHub HEAD lookup returned ${r.status} for ${data.githubRepo}@${branch}` +
              (body ? `: ${body.slice(0, 160)}` : ""),
          );
        }
      } catch (e) {
        warnings.push(`GitHub HEAD lookup failed: ${(e as Error).message}`);
      }
    }

    if (!commit) {
      const detail = warnings.length ? `\n\nDetails:\n• ${warnings.join("\n• ")}` : "";
      throw new Error(
        "Could not determine deployed commit. Provide a manifest URL, a valid GitHub repo (org/repo) with a reachable branch, or paste the commit hash manually." +
          detail,
      );
    }

    // Fetch each file from GitHub raw at that commit
    if (!data.githubRepo) {
      throw new Error("GitHub repo (org/repo) is required to fetch the file contents at the resolved commit.");
    }
    const files: { path: string; content: string }[] = [];
    const headers: Record<string, string> = {};
    if (data.githubToken) headers.Authorization = `Bearer ${data.githubToken}`;
    for (const path of data.targetFiles) {
      const url = `https://raw.githubusercontent.com/${data.githubRepo}/${commit}/${path}`;
      try {
        const r = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
        if (r.ok) {
          const content = await r.text();
          files.push({ path, content: content.slice(0, 80_000) });
        } else {
          warnings.push(`${path}: HTTP ${r.status}`);
        }
      } catch (e) {
        warnings.push(`${path}: ${(e as Error).message}`);
      }
    }

    if (files.length === 0) {
      throw new Error(`Could not fetch any of the requested files at commit ${commit.slice(0, 8)}.`);
    }

    return {
      manifest: {
        vehicleId: data.vehicleId,
        commitHash: commit,
        branch,
        source,
        fetchedAt: Date.now(),
        warnings,
      },
      files,
      fetchMethod: source === "manifest" ? "manifest+github" : source === "github" ? "github-head" : "manual+github",
      warnings,
    };
  });

// ───────────────────────── Stage analysis ─────────────────────────

const STAGE_PROMPTS: Record<1 | 2 | 3, string> = {
  1: `You are Forensics Bot, an expert AV engineer powered by Qwen3 reasoning, specializing in post-deployment forensic debugging.
Inputs: deployed vehicle code (identifiers anonymized as fn_NNNN) and a failure description.
Logs are NOT yet available. Analyze the code statically. Generate ranked hypotheses and predict log signatures.
Always call submit_stage1.`,
  2: `You are Forensics Bot, an expert AV engineer powered by Qwen3 reasoning. You have anonymized deployed code, a failure description, AND system logs.
Correlate log evidence against the prior hypotheses (passed in). Reconstruct the timeline. Find the root cause.
Always call submit_stage2.`,
  3: `You are Forensics Bot, an expert AV engineer powered by Qwen3 reasoning. You have anonymized code, logs, AND ROS bag / sensor data excerpts.
Trace the full perception → planning → control chain. Determine the failure layer and the definitive root cause.
Always call submit_stage3.`,
};

const stage1Tool = {
  type: "function" as const,
  function: {
    name: "submit_stage1",
    description: "Submit Stage 1 hypotheses.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        critical_path: { type: "array", items: { type: "string" } },
        hypotheses: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              confidence: { type: "string", enum: ["High", "Medium", "Low"] },
              mechanism: { type: "string" },
              code_evidence: { type: "string" },
              log_signatures: { type: "array", items: { type: "string" } },
              eliminates_if: { type: "string" },
            },
            required: ["id", "title", "confidence", "mechanism", "code_evidence", "log_signatures", "eliminates_if"],
            additionalProperties: false,
          },
        },
        what_to_grep: { type: "array", items: { type: "string" } },
        timeline_question: { type: "string" },
        unknowns: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "critical_path", "hypotheses", "what_to_grep", "timeline_question", "unknowns"],
      additionalProperties: false,
    },
  },
};

const stage2Tool = {
  type: "function" as const,
  function: {
    name: "submit_stage2",
    description: "Submit Stage 2 root cause from code + logs.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        timeline: {
          type: "array",
          items: {
            type: "object",
            properties: {
              offset: { type: "string" },
              event: { type: "string" },
              source: { type: "string" },
            },
            required: ["offset", "event", "source"],
            additionalProperties: false,
          },
        },
        hypothesis_verdicts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              verdict: { type: "string", enum: ["CONFIRMED", "ELIMINATED", "POSSIBLE"] },
              evidence: { type: "string" },
            },
            required: ["id", "verdict", "evidence"],
            additionalProperties: false,
          },
        },
        root_cause: {
          type: "object",
          properties: {
            function: { type: "string" },
            line_hint: { type: "string" },
            mechanism: { type: "string" },
            confidence: { type: "string", enum: ["High", "Medium", "Low"] },
          },
          required: ["function", "line_hint", "mechanism", "confidence"],
          additionalProperties: false,
        },
        what_vehicle_saw: { type: "string" },
        still_unknown: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "timeline", "hypothesis_verdicts", "root_cause", "what_vehicle_saw", "still_unknown"],
      additionalProperties: false,
    },
  },
};

const stage3Tool = {
  type: "function" as const,
  function: {
    name: "submit_stage3",
    description: "Submit Stage 3 definitive cause from code + logs + sensor data.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        failure_layer: { type: "string", enum: ["SENSING", "PROCESSING", "PLANNING", "CONTROL"] },
        perception_state: {
          type: "object",
          properties: {
            what_vehicle_saw: { type: "string" },
            what_it_should_have_seen: { type: "string" },
            discrepancy: { type: "string" },
          },
          required: ["what_vehicle_saw", "what_it_should_have_seen", "discrepancy"],
          additionalProperties: false,
        },
        full_chain: {
          type: "array",
          items: {
            type: "object",
            properties: {
              layer: { type: "string" },
              input: { type: "string" },
              output: { type: "string" },
              issue: { type: "string" },
            },
            required: ["layer", "input", "output", "issue"],
            additionalProperties: false,
          },
        },
        definitive_cause: {
          type: "object",
          properties: {
            function: { type: "string" },
            mechanism: { type: "string" },
            confidence: { type: "string", enum: ["High"] },
          },
          required: ["function", "mechanism", "confidence"],
          additionalProperties: false,
        },
        fix: { type: "string" },
        test_case: { type: "string" },
      },
      required: ["summary", "failure_layer", "perception_state", "full_chain", "definitive_cause", "fix", "test_case"],
      additionalProperties: false,
    },
  },
};

const StageInput = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  code: z.string().min(1).max(200_000),
  failureDescription: z.string().min(1).max(5_000),
  logs: z.string().max(120_000).optional(),
  bagData: z.string().max(120_000).optional(),
  priorStage1: z.unknown().optional(),
  priorStage2: z.unknown().optional(),
});

function deepRestore(value: any, rev: Map<string, string>): any {
  if (typeof value === "string") return restore(value, rev);
  if (Array.isArray(value)) return value.map((v) => deepRestore(v, rev));
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepRestore(v, rev);
    return out;
  }
  return value;
}

export const runForensicStage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => StageInput.parse(d))
  .handler(async ({ data }): Promise<{ result: StageResult; sanitizationStats: { identifiersTokenized: number; commentsStripped: number; secretsBlocked: number } }> => {
    getAIConfig();

    const codeS = sanitize(data.code);
    const failureS = sanitize(data.failureDescription);
    const logsS = data.logs ? sanitize(data.logs) : null;
    const bagS = data.bagData ? sanitize(data.bagData) : null;

    // Combine reverse maps so restore() works on AI output that references any token
    const reverse = new Map<string, string>();
    for (const m of [codeS.reverseMap, failureS.reverseMap, logsS?.reverseMap, bagS?.reverseMap]) {
      if (m) for (const [k, v] of m.entries()) reverse.set(k, v);
    }

    const tools = [stage1Tool, stage2Tool, stage3Tool];
    const toolName = `submit_stage${data.stage}` as const;

    const userParts: string[] = [
      `DEPLOYED CODE (anonymized):\n${codeS.sanitized.slice(0, 50_000)}`,
      `\n\nFAILURE DESCRIPTION:\n${failureS.sanitized}`,
    ];
    if (data.priorStage1) userParts.push(`\n\nSTAGE 1 HYPOTHESES:\n${JSON.stringify(data.priorStage1)}`);
    if (data.priorStage2) userParts.push(`\n\nSTAGE 2 ROOT CAUSE:\n${JSON.stringify(data.priorStage2)}`);
    if (logsS) userParts.push(`\n\nSYSTEM LOGS (anonymized):\n${logsS.sanitized.slice(0, 40_000)}`);
    if (bagS) userParts.push(`\n\nROS BAG / SENSOR DATA (anonymized):\n${bagS.sanitized.slice(0, 40_000)}`);

    const resp = await fetchAIWithFallback(JSON.stringify({
      messages: [
        { role: "system", content: STAGE_PROMPTS[data.stage] },
        { role: "user", content: userParts.join("") },
      ],
      tools,
      tool_choice: { type: "function", function: { name: toolName } },
    }), "google/gemini-2.5-flash", `forensicStage${data.stage}`);

    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 429) throw new Error("Rate limit reached. Try again shortly.");
      if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace > Usage.");
      throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 300)}`);
    }

    const json = await resp.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured analysis.");

    const parsedRaw = JSON.parse(toolCall.function.arguments);
    const restored = deepRestore(parsedRaw, reverse) as StageResult;
    restored.stage = data.stage as any;

    return {
      result: restored,
      sanitizationStats: {
        identifiersTokenized:
          codeS.stats.identifiersTokenized +
          failureS.stats.identifiersTokenized +
          (logsS?.stats.identifiersTokenized ?? 0) +
          (bagS?.stats.identifiersTokenized ?? 0),
        commentsStripped:
          codeS.stats.commentsStripped +
          (logsS?.stats.commentsStripped ?? 0) +
          (bagS?.stats.commentsStripped ?? 0),
        secretsBlocked:
          codeS.stats.secretsBlocked +
          failureS.stats.secretsBlocked +
          (logsS?.stats.secretsBlocked ?? 0) +
          (bagS?.stats.secretsBlocked ?? 0),
      },
    };
  });
