import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SeverityBadge } from "@/components/severity-badge";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/reports")({ component: ReportsPage });

function ReportsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("incidents").select("*").eq("status", "complete").order("created_at", { ascending: false })
      .then(({ data }) => setItems(data ?? []));
  }, []);

  const dl = (i: any) => {
    const blob = new Blob([i.analysis?.reportMarkdown ?? ""], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${i.title}.md`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Documentation</div>
        <h1 className="text-2xl font-bold">Safety Reports</h1>
      </div>
      <div className="space-y-2">
        {items.map((i) => (
          <div key={i.id} className="rounded-lg border border-border bg-surface p-4 flex items-center gap-4">
            <SeverityBadge severity={i.severity} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{i.title}</div>
              <div className="text-xs text-muted-foreground line-clamp-1">{i.analysis?.summary}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => dl(i)} className="gap-1.5"><Download className="h-3.5 w-3.5"/> Markdown</Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">No completed reports yet.</p>}
      </div>
    </div>
  );
}
