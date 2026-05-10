import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({ incidentId: z.string().uuid() });

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://rqljghnthchkdoimicev.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://lablab-ai-amd-developer-hackathon-drivecore.hf.space";

async function dbUpdate(incidentId: string, body: object) {
  await fetch(`${SUPABASE_URL}/rest/v1/incidents?id=eq.${incidentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Prefer": "return=minimal" },
    body: JSON.stringify(body),
  });
}

async function dbGet(incidentId: string) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/incidents?id=eq.${incidentId}&select=*`, {
    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
  });
  const rows = await resp.json();
  return rows[0] ?? null;
}

async function callQwenStructured(incident: any): Promise<any> {
  const prompt = `You are Qwen the AutoPulse Bot. Analyze this AV incident and return a JSON object with these exact fields:
{
  "summary": "2-3 sentence executive summary",
  "events": ["event 1", "event 2", "event 3"],
  "rootCauses": ["root cause 1", "root cause 2"],
  "complianceFlags": [{"code": "ISO 26262", "description": "description", "severity": "high"}],
  "coachingRecommendations": ["recommendation 1", "recommendation 2"],
  "severity": "high",
  "reportMarkdown": "# Full Report\\n\\nHi I'm Qwen the AutoPulse Bot...\\n\\n## Qwen's Personal Recommendation\\n..."
}

Return ONLY the JSON object, no other text.

INCIDENT: ${incident.title}
SOURCE: ${incident.source_type}
CONTENT: ${incident.raw_text ?? "No content provided"}`;

  const resp = await fetch(`${AI_BASE_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  const json = await resp.json();
  const output = json.output ?? "";
  
  try {
    const clean = output.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      summary: output.slice(0, 500),
      events: ["See full analysis below"],
      rootCauses: ["See full analysis below"],
      complianceFlags: [{ code: "ISO 26262", description: "See full analysis", severity: "medium" }],
      coachingRecommendations: ["See full analysis below"],
      severity: "unknown",
      reportMarkdown: output,
    };
  }
}

export const analyzeIncident = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const incident = await dbGet(data.incidentId);
    if (!incident) throw new Response("Incident not found", { status: 404 });

    await dbUpdate(data.incidentId, { status: "analyzing", error: null });

    try {
      const analysis = await callQwenStructured(incident);
      await dbUpdate(data.incidentId, { 
        analysis, 
        severity: analysis.severity ?? "unknown", 
        status: "complete" 
      });
      return { ok: true, analysis };
    } catch (e: any) {
      await dbUpdate(data.incidentId, { status: "failed", error: e.message ?? "Unknown error" });
      throw e;
    }
  });
