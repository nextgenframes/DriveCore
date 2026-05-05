import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/dashboard/coaching")({ component: CoachingPage });

function CoachingPage() {
  const [recs, setRecs] = useState<{ incident: string; rec: string; severity: string }[]>([]);
  useEffect(() => {
    supabase.from("incidents").select("title,severity,analysis").eq("status", "complete").then(({ data }) => {
      const all: any[] = [];
      (data ?? []).forEach((i: any) => (i.analysis?.coachingRecommendations ?? []).forEach((r: string) => all.push({ incident: i.title, rec: r, severity: i.severity })));
      setRecs(all);
    });
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Operator Development</div>
        <h1 className="text-2xl font-bold">Coaching Recommendations</h1>
      </div>
      <div className="space-y-2">
        {recs.map((r, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4 flex items-start gap-4">
            <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><GraduationCap className="h-4 w-4"/></div>
            <div className="flex-1">
              <p className="text-sm">{r.rec}</p>
              <p className="text-[11px] text-muted-foreground font-mono mt-1">From: {r.incident}</p>
            </div>
          </div>
        ))}
        {recs.length === 0 && <p className="text-sm text-muted-foreground">No recommendations yet.</p>}
      </div>
    </div>
  );
}
