import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/ai-logs")({
  component: AiLogsPage,
});

type LogRow = {
  id: string;
  created_at: string;
  label: string;
  requested_model: string;
  resolved_model: string;
  endpoint: string;
  base_url: string;
  used_fallback: boolean;
  status_code: number | null;
  ok: boolean;
  attempts: number;
  duration_ms: number | null;
  error: string | null;
};

function AiLogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_call_logs" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Backend</div>
          <h1 className="text-lg font-semibold">AI Call Log</h1>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-3 max-w-6xl">
          <p className="text-xs text-muted-foreground">
            Every AI request from any tab is recorded here with the resolved model, endpoint, and gateway used.
            Use this to verify which model actually served each analysis.
          </p>

          {loading ? (
            <div className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No AI calls logged yet. Run an analysis on any tab.</div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead className="bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Tab / Label</th>
                    <th className="px-3 py-2 text-left">Resolved Model</th>
                    <th className="px-3 py-2 text-left">Endpoint</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Attempts</th>
                    <th className="px-3 py-2 text-right">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border align-top">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{r.label}</td>
                      <td className="px-3 py-2">
                        <div>{r.resolved_model}</div>
                        {r.resolved_model !== r.requested_model && (
                          <div className="text-[10px] text-muted-foreground">requested: {r.requested_model}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="break-all">{r.endpoint}</div>
                        {r.used_fallback && (
                          <div className="text-[10px] text-amber-500">via fallback gateway</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center gap-1", r.ok ? "text-emerald-500" : "text-destructive")}>
                          {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                          {r.status_code ?? "—"}
                        </span>
                        {r.error && <div className="text-[10px] text-destructive mt-0.5 max-w-[260px] truncate" title={r.error}>{r.error}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">{r.attempts}</td>
                      <td className="px-3 py-2 text-right">{r.duration_ms ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
