import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UploadDialog } from "@/components/upload-dialog";
import { SeverityBadge } from "@/components/severity-badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, FileText, Cpu, Shield, Activity, BookText, Download, RefreshCw, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { analyzeIncident } from "@/server/incidents.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: IncidentsPage,
});

type Incident = {
  id: string; title: string; severity: string; status: string;
  created_at: string; analysis: any; source_type: string; error: string | null;
  raw_text: string | null; file_name: string | null;
};

function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const analyze = useServerFn(analyzeIncident);

  const load = useCallback(async () => {
    const { data } = await supabase.from("incidents").select("*").order("created_at", { ascending: false });
    setIncidents((data ?? []) as any);
    setLoading(false);
    if (data && data.length && !selectedId) setSelectedId(data[0].id);
  }, [selectedId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("incidents-rt").on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const selected = incidents.find((i) => i.id === selectedId);

  const rerun = async (id: string) => {
    try { await analyze({ data: { incidentId: id } }); toast.success("Analysis updated"); }
    catch (e: any) { toast.error(e.message); }
  };

  const remove = async (id: string) => {
    await supabase.from("incidents").delete().eq("id", id);
    toast.success("Incident deleted");
  };

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Operations</div>
          <h1 className="text-lg font-semibold">Incident Analysis</h1>
        </div>
        <UploadDialog onCreated={(id) => setSelectedId(id)} />
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] min-h-0">
        {/* Incident list */}
        <div className="border-r border-border flex flex-col min-h-0">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Feed ({incidents.length})</h2>
            <button onClick={load} className="text-muted-foreground hover:text-foreground"><RefreshCw className="h-3.5 w-3.5"/></button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto"/></div>
              ) : incidents.length === 0 ? (
                <EmptyHint />
              ) : incidents.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setSelectedId(i.id)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors group",
                    selectedId === i.id
                      ? "bg-surface-elevated border-primary/50 shadow-[var(--shadow-glow)]"
                      : "bg-surface border-border hover:border-primary/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-medium text-sm leading-tight line-clamp-2">{i.title}</span>
                    <SeverityBadge severity={i.severity} />
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono uppercase">
                    <StatusDot status={i.status} />
                    <span>{i.status}</span>
                    <span>·</span>
                    <span>{new Date(i.created_at).toLocaleString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Detail */}
        <ScrollArea className="bg-background">
          {selected ? <IncidentDetail incident={selected} onRerun={() => rerun(selected.id)} onDelete={() => remove(selected.id)} /> : <DetailEmpty />}
        </ScrollArea>
      </div>
    </>
  );
}

function StatusDot({ status }: { status: string }) {
  const c = status === "complete" ? "bg-severity-low" : status === "analyzing" ? "bg-primary animate-pulse" : status === "failed" ? "bg-severity-critical" : "bg-muted-foreground";
  return <span className={cn("h-1.5 w-1.5 rounded-full", c)} />;
}

function EmptyHint() {
  return (
    <div className="text-center py-12 px-4">
      <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
      <p className="text-sm font-medium">No incidents yet</p>
      <p className="text-xs text-muted-foreground mt-1">Submit your first report to begin analysis.</p>
    </div>
  );
}

function DetailEmpty() {
  return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Select an incident to view analysis.</div>;
}

function IncidentDetail({ incident, onRerun, onDelete }: { incident: Incident; onRerun: () => void; onDelete: () => void }) {
  const a = incident.analysis;

  const exportReport = () => {
    if (!a?.reportMarkdown) return;
    const blob = new Blob([a.reportMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${incident.title.replace(/\s+/g, "-")}.md`;
    link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">{incident.title}</h2>
            <SeverityBadge severity={incident.severity} />
          </div>
          <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider flex items-center gap-2">
            <StatusDot status={incident.status} /> {incident.status} · {incident.source_type} · {new Date(incident.created_at).toLocaleString()}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onRerun} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5"/> Rerun</Button>
          {a?.reportMarkdown && <Button variant="ghost" size="sm" onClick={exportReport} className="gap-1.5"><Download className="h-3.5 w-3.5"/> Export</Button>}
          <Button variant="ghost" size="sm" onClick={onDelete} className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5"/></Button>
        </div>
      </div>

      {incident.status === "analyzing" && <AgentPipeline />}

      {incident.status === "failed" && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <p className="font-medium text-sm text-destructive">Analysis failed</p>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{incident.error}</p>
        </div>
      )}

      {a && (
        <>
          {/* Agent grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <AgentChip icon={Cpu} label="Event Extraction" count={a.events?.length} />
            <AgentChip icon={Shield} label="Safety" count={a.complianceFlags?.length} />
            <AgentChip icon={Activity} label="Risk" count={a.rootCauses?.length} />
            <AgentChip icon={BookText} label="Documentation" count={a.coachingRecommendations?.length} />
          </div>

          <Section title="Executive Summary">
            <p className="text-sm leading-relaxed text-foreground/90">{a.summary}</p>
          </Section>

          <div className="grid lg:grid-cols-2 gap-6">
            <Section title="Timeline of Events" icon={Cpu}>
              <ol className="space-y-2">
                {a.events?.map((e: string, i: number) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <span className="font-mono text-xs text-primary w-6 shrink-0">{String(i+1).padStart(2,"0")}</span>
                    <span className="text-foreground/85">{e}</span>
                  </li>
                ))}
              </ol>
            </Section>

            <Section title="Probable Root Causes" icon={Activity}>
              <ul className="space-y-2">
                {a.rootCauses?.map((r: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-severity-high">▸</span>{r}</li>
                ))}
              </ul>
            </Section>

            <Section title="Compliance Concerns" icon={Shield}>
              <div className="space-y-2">
                {a.complianceFlags?.map((c: any, i: number) => (
                  <div key={i} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-xs font-mono text-primary">{c.code}</code>
                      <SeverityBadge severity={c.severity} />
                    </div>
                    <p className="text-xs text-muted-foreground">{c.description}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Coaching Recommendations" icon={BookText}>
              <ul className="space-y-2">
                {a.coachingRecommendations?.map((r: string, i: number) => (
                  <li key={i} className="text-sm flex gap-2"><span className="text-primary">→</span>{r}</li>
                ))}
              </ul>
            </Section>
          </div>

          {incident.raw_text && (
            <Section title="Raw Input" icon={FileText}>
              <pre className="text-[11px] font-mono whitespace-pre-wrap text-muted-foreground max-h-48 overflow-auto">{incident.raw_text}</pre>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-5">
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon className="h-3.5 w-3.5 text-primary" />}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function AgentChip({ icon: Icon, label, count }: { icon: any; label: string; count?: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3 flex items-center gap-3">
      <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-4 w-4"/></div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
        <div className="text-sm font-semibold">{count ?? 0} {count === 1 ? "item" : "items"}</div>
      </div>
    </div>
  );
}
