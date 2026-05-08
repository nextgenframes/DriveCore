import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SeverityBadge } from "@/components/severity-badge";

export const Route = createFileRoute("/dashboard/compliance")({ component: CompliancePage });

function CompliancePage() {
  const [flags, setFlags] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("incidents").select("title,analysis").eq("status", "complete").then(({ data }) => {
      const all: any[] = [];
      (data ?? []).forEach((i: any) => (i.analysis?.complianceFlags ?? []).forEach((f: any) => all.push({ ...f, incident: i.title })));
      setFlags(all);
    });
  }, []);

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Regulatory</div>
        <h1 className="text-2xl font-bold">Compliance Bot</h1>
      </div>
      <div className="space-y-2">
        {flags.map((f, i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-1">
              <code className="text-sm font-mono text-primary">{f.code}</code>
              <SeverityBadge severity={f.severity} />
            </div>
            <p className="text-sm text-foreground/90">{f.description}</p>
            <p className="text-[11px] text-muted-foreground font-mono mt-2">From: {f.incident}</p>
          </div>
        ))}
        {flags.length === 0 && <p className="text-sm text-muted-foreground">No compliance flags yet.</p>}
      </div>
    </div>
  );
}
