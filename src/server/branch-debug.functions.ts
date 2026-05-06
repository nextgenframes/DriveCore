import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  diff: z.string().min(1).max(200_000),
  failureDescription: z.string().min(1).max(5_000),
});

export type Suspect = {
  filePath: string;
  functionName: string | null;
  lineStart: number;
  lineEnd: number;
  confidence: "high" | "medium" | "low";
  mechanism: string;
  changeSummary: string;
  beforeSnippet: string | null;
  afterSnippet: string | null;
};

export type AuditEntry = { token: string; real: string; occurrences: number };
export type AuditSample = { original: string; sanitized: string };

export type DebugResult = {
  suspects: Suspect[];
  summary: string;
  sanitizationStats: { identifiersTokenized: number; commentsStripped: number; secretsBlocked: number };
  audit: {
    tokenMap: AuditEntry[];               // real -> token, sorted by occurrence
    redactedComments: string[];           // up to 20 stripped comment lines (already comment-only, safe to show)
    secretMatches: { pattern: string; replaced: string }[]; // never the real secret
    sample: AuditSample;                  // first ~30 lines: original vs sanitized side-by-side
  };
};

// ───────────────────────── IP Shield: sanitizer ─────────────────────────
// Strips comments + secrets, replaces identifiers with fn_NNNN tokens.
// Token map stays server-side and is used to restore real names afterwards.

const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password|bearer)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/gi,
  /sk-[A-Za-z0-9]{20,}/g,
  /eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}/g, // JWT
];

const RESERVED = new Set([
  "if","else","for","while","return","def","class","import","from","const","let","var",
  "function","async","await","try","catch","throw","new","null","true","false","this",
  "self","int","str","bool","void","public","private","static","export","default",
  "diff","git","index","main","feature","a","b","fix","add","remove","update",
]);

function sanitize(diff: string) {
  const tokenMap = new Map<string, string>();      // real -> token
  const reverseMap = new Map<string, string>();    // token -> real
  const occurrences = new Map<string, number>();   // real -> count
  const redactedComments: string[] = [];
  const secretMatches: { pattern: string; replaced: string }[] = [];
  let counter = 1;
  let commentsStripped = 0;
  let secretsBlocked = 0;

  // Strip secrets first
  const PATTERN_LABELS = ["api-key/secret/token assignment", "OpenAI key (sk-…)", "JWT bearer"];
  SECRET_PATTERNS.forEach((re, idx) => {
    diff = diff.replace(re, (match) => {
      secretsBlocked++;
      // Only record a safe length-summary, NEVER the secret itself
      secretMatches.push({
        pattern: PATTERN_LABELS[idx] ?? "secret",
        replaced: `[REDACTED ${match.length} chars]`,
      });
      return "[SECRET_REDACTED]";
    });
  });

  // Strip comments line-wise (#, //, /* */)
  const lines = diff.split("\n").map((line) => {
    const original = line;
    const stripped = line
      .replace(/(^|\s)#.*$/g, "$1")
      .replace(/\/\/.*$/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    if (stripped !== original) {
      commentsStripped++;
      const removed = original.slice(stripped.length).trim();
      if (removed && redactedComments.length < 20) redactedComments.push(removed);
    }
    return stripped;
  });

  const tokenize = (name: string): string => {
    if (RESERVED.has(name) || /^\d+$/.test(name) || name.length < 3) return name;
    occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
    let tok = tokenMap.get(name);
    if (!tok) {
      tok = `fn_${String(counter++).padStart(4, "0")}`;
      tokenMap.set(name, tok);
      reverseMap.set(tok, name);
    }
    return tok;
  };

  // Tokenize identifiers (simple heuristic: snake_case / camelCase words)
  const sanitizedLines = lines.map((line) => {
    if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("@@")) {
      return line.replace(/[A-Za-z_][A-Za-z0-9_]{2,}/g, (m) => tokenize(m));
    }
    return line.replace(/[A-Za-z_][A-Za-z0-9_]{2,}/g, (m) => tokenize(m));
  });

  const sanitized = sanitizedLines.join("\n");

  // Build audit token map sorted by occurrence (most-used first)
  const auditMap: AuditEntry[] = Array.from(tokenMap.entries())
    .map(([real, token]) => ({ token, real, occurrences: occurrences.get(real) ?? 0 }))
    .sort((a, b) => b.occurrences - a.occurrences);

  // Sample: first 30 non-empty lines, original (post-secret-redaction) vs sanitized
  const SAMPLE_LINES = 30;
  const sample: AuditSample = {
    original: diff.split("\n").slice(0, SAMPLE_LINES).join("\n"),
    sanitized: sanitized.split("\n").slice(0, SAMPLE_LINES).join("\n"),
  };

  return {
    sanitized,
    reverseMap,
    stats: { identifiersTokenized: tokenMap.size, commentsStripped, secretsBlocked },
    audit: { tokenMap: auditMap, redactedComments, secretMatches, sample },
  };
}

function restore(text: string, reverseMap: Map<string, string>): string {
  return text.replace(/fn_\d{4}/g, (tok) => reverseMap.get(tok) ?? tok);
}

// ───────────────────────── Diff parser (file path + line numbers) ─────────────────────────
// Parses unified diff so we can report real file paths and the exact added-line range
// for each hunk. The AI returns a hunk index + reasoning; we look up the location here.

type Hunk = {
  filePath: string;
  hunkIndex: number;
  newStart: number;       // first new-file line of the hunk
  newEnd: number;         // last new-file line that was added/changed
  addedLines: string[];
  removedLines: string[];
  functionContext: string | null;
};

function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let currentFile: string | null = null;
  let hunkIndex = 0;
  const lines = diff.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const gitMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (gitMatch) { currentFile = gitMatch[2]; continue; }
    const plusFile = line.match(/^\+\+\+ (?:b\/)?(.+?)(?:\s|$)/);
    if (plusFile && plusFile[1] !== "/dev/null") { currentFile = plusFile[1]; continue; }

    const hunkHeader = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkHeader) {
      if (!currentFile) currentFile = "unknown";
      const newStart = parseInt(hunkHeader[1], 10);
      const newCount = parseInt(hunkHeader[2] ?? "1", 10);
      const fnCtx = hunkHeader[3].trim() || null;

      const added: string[] = [];
      const removed: string[] = [];
      let cursor = newStart;
      let lastChanged = newStart;

      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (l.startsWith("@@") || l.startsWith("diff --git")) break;
        if (l.startsWith("+") && !l.startsWith("+++")) { added.push(l.slice(1)); lastChanged = cursor; cursor++; }
        else if (l.startsWith("-") && !l.startsWith("---")) { removed.push(l.slice(1)); }
        else { cursor++; }
      }

      hunks.push({
        filePath: currentFile,
        hunkIndex: hunkIndex++,
        newStart,
        newEnd: Math.max(newStart, lastChanged),
        addedLines: added,
        removedLines: removed,
        functionContext: fnCtx,
      });
    }
  }
  return hunks;
}

// ───────────────────────── AI tool schema ─────────────────────────
const analysisTool = {
  type: "function" as const,
  function: {
    name: "submit_root_cause_analysis",
    description: "Submit ranked root-cause suspects derived from a sanitized git diff and a failure description.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "1-2 sentence overall verdict." },
        suspects: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              hunkIndex: { type: "number", description: "Index into the provided HUNKS list (0-based)." },
              functionToken: { type: "string", description: "Anonymized function token (e.g. fn_0019), or empty string." },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              mechanism: { type: "string", description: "Plain-English explanation of why this change causes the failure." },
              changeSummary: { type: "string", description: "Short label of the change (e.g. 'Threshold change 15→16')." },
            },
            required: ["hunkIndex", "functionToken", "confidence", "mechanism", "changeSummary"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "suspects"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are BranchDebug, a code-aware root-cause analyzer. Inputs are:
1. A SANITIZED unified git diff where real identifiers have been replaced with opaque tokens like fn_0019.
2. A natural-language description of an observed failure.
3. A numbered list of HUNKS (filePath, lineRange, function context).

For each hunk that plausibly caused the failure, return a suspect entry with:
- hunkIndex (the number from the HUNKS list)
- confidence (high/medium/low) — only mark "high" when the mechanism directly explains the failure
- mechanism — concrete cause-and-effect
- changeSummary — a short label

Rank by likelihood. Be conservative; if a hunk is unrelated, do not include it. Always call submit_root_cause_analysis.`;

export async function analyzeDiff(diff: string, failureDescription: string): Promise<DebugResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const { sanitized, reverseMap, stats, audit } = sanitize(diff);
  const hunks = parseDiff(diff);
  if (hunks.length === 0) throw new Error("No hunks found in diff. Make sure the input is a unified git diff.");

  const sanitizedHunks = parseDiff(sanitized);
  const hunkList = sanitizedHunks.map((h, i) => {
    const realLoc = hunks[i];
    const range = realLoc ? `lines ${realLoc.newStart}-${realLoc.newEnd}` : `lines ?`;
    const ctx = h.functionContext ? ` in ${h.functionContext}` : "";
    const added = h.addedLines.slice(0, 8).map((l) => `+ ${l}`).join("\n");
    const removed = h.removedLines.slice(0, 8).map((l) => `- ${l}`).join("\n");
    return `[${i}] ${h.filePath} (${range})${ctx}\n${removed}\n${added}`;
  }).join("\n\n");

  const userContent = `FAILURE DESCRIPTION (sanitized):\n${sanitize(failureDescription).sanitized}\n\nHUNKS:\n${hunkList}\n\nFULL SANITIZED DIFF:\n${sanitized.slice(0, 40_000)}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      tools: [analysisTool],
      tool_choice: { type: "function", function: { name: "submit_root_cause_analysis" } },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 429) throw new Error("Rate limit reached. Try again shortly.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace > Usage.");
    throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 300)}`);
  }

  const json = await resp.json();
  const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) throw new Error("AI did not return structured analysis.");

  const parsed = JSON.parse(toolCall.function.arguments) as {
    summary: string;
    suspects: { hunkIndex: number; functionToken: string; confidence: "high" | "medium" | "low"; mechanism: string; changeSummary: string }[];
  };

  const suspects: Suspect[] = parsed.suspects
    .filter((s) => hunks[s.hunkIndex])
    .map((s) => {
      const h = hunks[s.hunkIndex];
      return {
        filePath: h.filePath,
        functionName: s.functionToken ? restore(s.functionToken, reverseMap) : (h.functionContext ?? null),
        lineStart: h.newStart,
        lineEnd: h.newEnd,
        confidence: s.confidence,
        mechanism: restore(s.mechanism, reverseMap),
        changeSummary: restore(s.changeSummary, reverseMap),
        beforeSnippet: h.removedLines.slice(0, 6).join("\n") || null,
        afterSnippet: h.addedLines.slice(0, 6).join("\n") || null,
      };
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 } as const;
      return order[a.confidence] - order[b.confidence];
    });

  return {
    summary: restore(parsed.summary, reverseMap),
    suspects,
    sanitizationStats: stats,
    audit,
  };
}

export const debugBranch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }): Promise<DebugResult> => {
    return analyzeDiff(data.diff, data.failureDescription);
  });

