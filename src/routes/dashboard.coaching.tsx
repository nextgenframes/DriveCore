import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/dashboard/coaching")({ component: CoachingPage });

function CoachingPage() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("incidents").select("id,title,severity,analysis").eq("status", "complete").then(({ data }) => {
      setIncidents(data ?? []);
    });
  }, []);

  const hasReal = (recs: string[]) => recs.some(r => !r.toLowerCase().includes("see full") && !r.toLowerCase().includes("see report"));

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Operator Development</div>
        <h1 className="text-2xl font-bold">Coaching Bot</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-generated coaching recommendations from completed incident analyses.</p>
      </div>

      <div className="space-y-4">
        {incidents.map((incident) => {
          const a = incident.analysis;
          const recs: string[] = a?.coachingRecommendations ?? [];
          const reportMarkdown: string = a?.reportMarkdown ?? "";
          const isExpanded = expanded === incident.id;
          const showRecs = hasReal(recs);

          return (
            <div key={incident.id} className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(isExpanded ? null : incident.id)}>
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <GraduationCap className="h-4 w-4"/>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{incident.title}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {showRecs ? `${recs.length} recommendation${recs.length !== 1 ? "s" : ""}` : "Full report available"} · severity: {incident.severity}
                  </p>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0"/> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0"/>}
              </div>

              {isExpanded && (
                <div className="border-t border-border p-4 space-y-4">
                  {showRecs ? (
                    <ul className="space-y-2">
                      {recs.map((r, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="text-primary font-bold shrink-0">→</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  ) : reportMarkdown ? (
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-foreground/90 font-sans leading-relaxed">{reportMarkdown}</pre>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recommendations available.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {incidents.length === 0 && (
          <p className="text-sm text-muted-foreground">No completed incidents yet. Run an analysis first.</p>
        )}
      </div>
    </div>
  );
}
