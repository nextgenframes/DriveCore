import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const InputSchema = z.object({ incidentId: z.string().uuid() });
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://lablab-ai-amd-developer-hackathon-drivecore.hf.space";

async function callQwen(input: string): Promise<string> {
  const resp = await fetch(`${AI_BASE_URL}/triage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input }) });
  const json = await resp.json();
  return json.output ?? "No analysis returned.";
}

export const analyzeIncident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const supabase = supabaseAdmin;
    const { data: incident, error: fetchErr } = await supabase.from("incidents").select("*").eq("id", data.incidentId).single();
    if (fetchErr || !incident) throw new Response("Incident not found", { status: 404 });
    await supabase.from("incidents").update({ status: "analyzing", error: null }).eq("id", data.incidentId);
    try {
      const userContent = `INCIDENT TITLE: ${incident.title}\nSOURCE TYPE: ${incident.source_type}\nFILE: ${incident.file_name ?? "(none)"}\n\n--- RAW INPUT ---\n${incident.raw_text ?? "(no text content provided)"}`;
      const reportMarkdown = await callQwen(userContent);
      const analysis = { summary: `Qwen AutoPulse Bot analysis of: ${incident.title}`, events: [], rootCauses: ["See full Qwen report below"], complianceFlags: [], coachingRecommendations: [], severity: "unknown" as const, reportMarkdown };
      await supabase.from("incidents").update({ analysis: analysis as any, severity: analysis.severity, status: "complete" }).eq("id", data.incidentId);
      return { ok: true, analysis };
    } catch (e: any) {
      await supabase.from("incidents").update({ status: "failed", error: e.message ?? "Unknown error" }).eq("id", data.incidentId);
      throw e;
    }
  });
