import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { aiAuthHeaders, aiChatCompletionsUrl, getAIConfig, resolveModel } from "./ai-config";
import { z } from "zod";

const InputSchema = z.object({
  incidentId: z.string().uuid(),
});

type AgentResult = {
  summary: string;
  events: string[];
  rootCauses: string[];
  complianceFlags: { code: string; description: string; severity: "low" | "medium" | "high" }[];
  coachingRecommendations: string[];
  severity: "low" | "medium" | "high" | "critical" | "unknown";
  reportMarkdown: string;
};

const analysisTool = {
  type: "function" as const,
  function: {
    name: "submit_analysis",
    description: "Submit structured AV incident analysis from a multi-agent safety review.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "2-4 sentence executive summary of the incident." },
        events: { type: "array", items: { type: "string" }, description: "Key timestamped or sequential events extracted (Event Extraction Agent)." },
        rootCauses: { type: "array", items: { type: "string" }, description: "Probable root causes (Risk Agent)." },
        complianceFlags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              code: { type: "string", description: "Standard / regulation, e.g. NHTSA-AV-4.1.2, ISO 26262, SAE J3016" },
              description: { type: "string" },
              severity: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["code", "description", "severity"],
            additionalProperties: false,
          },
          description: "Compliance concerns identified by the Safety Agent.",
        },
        coachingRecommendations: { type: "array", items: { type: "string" }, description: "Operator/engineer coaching actions." },
        severity: { type: "string", enum: ["low", "medium", "high", "critical", "unknown"] },
        reportMarkdown: { type: "string", description: "A polished safety report in Markdown for export (Documentation Agent)." },
      },
      required: ["summary", "events", "rootCauses", "complianceFlags", "coachingRecommendations", "severity", "reportMarkdown"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are DriveCore, a multi-agent AI safety analyst for autonomous vehicle (AV) fleets. You orchestrate four specialised agents on every input:

1. EVENT EXTRACTION AGENT — pulls discrete timeline events from logs, transcripts, or sensor data.
2. SAFETY AGENT — identifies compliance concerns referencing standards (NHTSA AV Policy, ISO 26262, SAE J3016, FMVSS, UN R157).
3. RISK AGENT — identifies probable root causes (sensor failure, perception, planning, control, environmental, operator).
4. DOCUMENTATION AGENT — drafts a clean Markdown safety report with sections (Summary, Timeline, Root Causes, Compliance, Recommendations).

Be specific, technical, and concise. If input is sparse, infer plausible AV-domain causes but mark uncertainty. Always call submit_analysis with the structured result.`;

export const analyzeIncident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = supabaseAdmin;
    getAIConfig(); // validates env config early

    // Ownership-scoped fetch — RLS-equivalent guard even with admin client
    const { data: incident, error: fetchErr } = await supabase
      .from("incidents")
      .select("*")
      .eq("id", data.incidentId)
      .eq("user_id", context.userId)
      .single();
    if (fetchErr || !incident) throw new Response("Incident not found", { status: 404 });

    await supabase.from("incidents").update({ status: "analyzing", error: null }).eq("id", data.incidentId);

    try {
      const userContent = `INCIDENT TITLE: ${incident.title}\nSOURCE TYPE: ${incident.source_type}\nFILE: ${incident.file_name ?? "(none)"}\n\n--- RAW INPUT ---\n${incident.raw_text ?? "(no text content provided)"}`;

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
          tool_choice: { type: "function", function: { name: "submit_analysis" } },
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        if (resp.status === 429) throw new Error("Rate limit reached. Try again shortly.");
        if (resp.status === 402) throw new Error("AI credits exhausted. Add credits in Workspace > Usage.");
        throw new Error(`AI gateway error ${resp.status}: ${text.slice(0, 200)}`);
      }

      const json = await resp.json();
      const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall?.function?.arguments) throw new Error("AI did not return structured analysis.");

      const analysis: AgentResult = JSON.parse(toolCall.function.arguments);

      await supabase
        .from("incidents")
        .update({
          analysis: analysis as any,
          severity: analysis.severity,
          status: "complete",
        })
        .eq("id", data.incidentId);

      return { ok: true, analysis };
    } catch (e: any) {
      await supabase
        .from("incidents")
        .update({ status: "failed", error: e.message ?? "Unknown error" })
        .eq("id", data.incidentId);
      throw e;
    }
  });
