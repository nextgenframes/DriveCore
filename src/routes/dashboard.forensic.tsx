import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  testVehicleConnection,
  fetchVehicleCode,
  runForensicStage,
  type FetchedCode,
  type Stage1Result,
  type Stage2Result,
  type Stage3Result,
} from "@/lib/forensic.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Car, Plug, Loader2, GitBranch, Shield, Sparkles, FileCode,
  Terminal, Database, AlertTriangle, CheckCircle2, XCircle, Clock,
  ArrowRight, Lock, Activity,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/forensic")({
  component: ForensicPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-8 max-w-2xl mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-destructive">Forensic request failed</h2>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{error.message}</p>
      <button
        onClick={() => reset()}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
      >
        Try again
      </button>
    </div>
  ),
});

type Stage = 1 | 2 | 3;

const STAGE_META: Record<Stage, { label: string; sub: string; color: string; time: string; desc: string }> = {
  1: { label: "Stage 1", sub: "Code Only", color: "#4af0c4", time: "Immediate",
       desc: "Hypotheses & log signatures from the deployed code alone — before the bag finishes downloading." },
  2: { label: "Stage 2", sub: "Code + Logs", color: "#ffaa00", time: "10–30 min",
       desc: "Correlate logs against hypotheses. Eliminate, confirm, reconstruct the timeline." },
  3: { label: "Stage 3", sub: "Full Correlation", color: "#aa88ff", time: "Hours later",
       desc: "Add ROS bag excerpts. Trace perception → planning → control. Definitive cause + fix." },
};

type StageResults = { 1: Stage1Result | null; 2: Stage2Result | null; 3: Stage3Result | null };

function ForensicPage() {
  // Connection
  const [vehicleId, setVehicleId] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [githubBranch, setGithubBranch] = useState("main");
  const [githubToken, setGithubToken] = useState("");
  const [manualCommit, setManualCommit] = useState("");
  const [targetFiles, setTargetFiles] = useState("perception/tracker.py\nplanning/policy.py");
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, any> | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [fetched, setFetched] = useState<FetchedCode | null>(null);

  // Failure context
  const [failure, setFailure] = useState("");
  const [logs, setLogs] = useState("");
  const [bagData, setBagData] = useState("");

  // Stage state
  const [activeStage, setActiveStage] = useState<Stage>(1);
  const [stageLoading, setStageLoading] = useState<Stage | null>(null);
  const [results, setResults] = useState<StageResults>({ 1: null, 2: null, 3: null });
  const [sanStats, setSanStats] = useState<{ identifiersTokenized: number; commentsStripped: number; secretsBlocked: number } | null>(null);

  const testFn = useServerFn(testVehicleConnection);
  const fetchFn = useServerFn(fetchVehicleCode);
  const stageFn = useServerFn(runForensicStage);

  const handleTest = async () => {
    if (!vehicleId.trim()) return toast.error("Enter a vehicle ID first");
    setTesting(true); setTestResults(null);
    try {
      const r = await testFn({ data: {
        vehicleId: vehicleId.trim(),
        manifestUrl: manifestUrl.trim() || undefined,
        githubRepo: githubRepo.trim() || undefined,
        githubToken: githubToken.trim() || undefined,
      }});
      setTestResults(r.results);
      toast.success("Connection probed");
    } catch (e: any) { toast.error(await getErrorMessage(e, "Connection test failed")); }
    finally { setTesting(false); }
  };

  const handleConnect = async () => {
    if (!vehicleId.trim()) return toast.error("Vehicle ID required");
    if (!githubRepo.trim()) return toast.error("GitHub repo (org/repo) is required to fetch deployed files");
    const files = targetFiles.split("\n").map((s) => s.trim()).filter(Boolean);
    if (files.length === 0) return toast.error("List at least one target file");
    setConnecting(true); setFetched(null);
    setResults({ 1: null, 2: null, 3: null });
    try {
      const r = await fetchFn({ data: {
        vehicleId: vehicleId.trim(),
        targetFiles: files,
        manifestUrl: manifestUrl.trim() || undefined,
        githubRepo: githubRepo.trim(),
        githubBranch: githubBranch.trim() || "main",
        githubToken: githubToken.trim() || undefined,
        manualCommit: manualCommit.trim() || undefined,
      }});
      setFetched(r);
      toast.success(`Fetched ${r.files.length} file(s) at ${r.manifest.commitHash.slice(0, 8)}`);
    } catch (e: any) { toast.error(await getErrorMessage(e, "Fetch failed")); }
    finally { setConnecting(false); }
  };

  const runStage = async (stage: Stage) => {
    if (!fetched) return toast.error("Connect to a vehicle first");
    if (!failure.trim()) return toast.error("Describe the failure");
    if (stage >= 2 && !logs.trim()) return toast.error("Paste system logs for Stage 2");
    if (stage >= 3 && !bagData.trim()) return toast.error("Paste ROS bag / sensor data for Stage 3");
    setStageLoading(stage);
    try {
      const codeBlob = fetched.files.map((f) => `// ── ${f.path} ──\n${f.content}`).join("\n\n");
      const r = await stageFn({ data: {
        stage,
        code: codeBlob,
        failureDescription: failure,
        logs: stage >= 2 ? logs : undefined,
        bagData: stage >= 3 ? bagData : undefined,
        priorStage1: stage >= 2 ? results[1] : undefined,
        priorStage2: stage >= 3 ? results[2] : undefined,
      }});
      setResults((p) => ({ ...p, [stage]: r.result as any }));
      setSanStats(r.sanitizationStats);
      if (stage < 3) setActiveStage((stage + 1) as Stage);
      toast.success(`Stage ${stage} complete`);
    } catch (e: any) { toast.error(await getErrorMessage(e, `Stage ${stage} failed`)); }
    finally { setStageLoading(null); }
  };

  const elapsedSinceFetch = fetched ? Math.max(0, Math.floor((Date.now() - fetched.manifest.fetchedAt) / 1000)) : 0;

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Engineering · Post-Deployment</div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" /> Forensics Bot
          </h1>
        </div>
        {fetched && (
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {fetched.manifest.vehicleId}
            </span>
            <span className="text-muted-foreground">@ {fetched.manifest.commitHash.slice(0, 8)}</span>
            <span className="text-muted-foreground">{fetched.manifest.branch}</span>
            <span className="text-muted-foreground"><Clock className="h-3 w-3 inline mr-1" />{elapsedSinceFetch}s ago</span>
          </div>
        )}
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] min-h-0 overflow-hidden">
        {/* LEFT: Connect + inputs */}
        <div className="border-r border-border overflow-y-auto p-6 space-y-6 bg-surface/20">
          {/* Connect */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
              <Plug className="h-3.5 w-3.5 text-primary" /> Connect to vehicle
            </div>

            <Input value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} placeholder="Vehicle ID or IP (e.g. AV-073 or 10.42.0.21)" />

            <div className="grid grid-cols-1 gap-2">
              <Input value={manifestUrl} onChange={(e) => setManifestUrl(e.target.value)} placeholder="Manifest server URL (optional)" />
              <Input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="GitHub repo (org/repo) — required to fetch files" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={githubBranch} onChange={(e) => setGithubBranch(e.target.value)} placeholder="branch (main)" />
                <Input value={manualCommit} onChange={(e) => setManualCommit(e.target.value)} placeholder="commit (optional)" />
              </div>
              <Input type="password" value={githubToken} onChange={(e) => setGithubToken(e.target.value)} placeholder="GitHub token (private repos)" />
            </div>

            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Target files</label>
              <Textarea
                value={targetFiles} onChange={(e) => setTargetFiles(e.target.value)}
                rows={3} className="font-mono text-xs mt-1"
                placeholder={"perception/tracker.py\nplanning/policy.py"}
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={handleTest} disabled={testing}>
                {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />} Test
              </Button>
              <Button size="sm" className="flex-1 gap-1.5" onClick={handleConnect} disabled={connecting}>
                {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plug className="h-3 w-3" />}
                {connecting ? "Fetching…" : "Connect & fetch"}
              </Button>
            </div>

            {testResults && (
              <div className="rounded-md border border-border bg-background p-3 text-[11px] font-mono space-y-1">
                {Object.entries(testResults).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="text-foreground truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            {fetched && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-[11px] space-y-1.5">
                <div className="flex items-center gap-1.5 text-primary font-mono uppercase tracking-widest text-[10px]">
                  <CheckCircle2 className="h-3 w-3" /> Connected · {fetched.fetchMethod}
                </div>
                <div className="font-mono text-muted-foreground">
                  <GitBranch className="h-3 w-3 inline mr-1" />
                  {fetched.manifest.branch} @ {fetched.manifest.commitHash.slice(0, 12)}
                </div>
                <div className="text-muted-foreground">{fetched.files.length} file(s) loaded</div>
                {fetched.warnings.length > 0 && (
                  <div className="pt-1 border-t border-primary/20 text-yellow-500">
                    {fetched.warnings.slice(0, 3).map((w, i) => (
                      <div key={i} className="flex gap-1"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Failure description */}
          <section className="space-y-2">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Failure description</div>
            <Textarea value={failure} onChange={(e) => setFailure(e.target.value)} rows={3}
              placeholder="e.g. Vehicle failed to stop for pedestrian at intersection. Clear weather, daytime."
              className="text-xs" />
          </section>

          {activeStage >= 2 && (
            <section className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-yellow-500">System logs (Stage 2)</div>
              <Textarea value={logs} onChange={(e) => setLogs(e.target.value)} rows={6}
                placeholder={"[14:33:18.201] perception: tracker init ok\n[14:33:21.442] FAILURE: emergency brake override"}
                className="font-mono text-[11px]" />
            </section>
          )}

          {activeStage >= 3 && (
            <section className="space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest" style={{ color: STAGE_META[3].color }}>ROS bag / sensor (Stage 3)</div>
              <Textarea value={bagData} onChange={(e) => setBagData(e.target.value)} rows={6}
                placeholder={"/perception/tracked_objects [14:33:21.101]:\n  objects: [{id:7, class:'pedestrian', confidence:0.12}]"}
                className="font-mono text-[11px]" />
            </section>
          )}

          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex gap-2 text-[10px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
            <span>Code, logs, and sensor data are sanitized server-side (identifiers tokenized, comments stripped, secrets redacted) before any AI call. Real names restored locally.</span>
          </div>
        </div>

        {/* RIGHT: Stages + results */}
        <div className="overflow-y-auto p-6 space-y-5">
          {/* Stage selector */}
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as Stage[]).map((s) => {
              const meta = STAGE_META[s];
              const done = !!results[s];
              const active = activeStage === s;
              const locked = s > 1 && !results[(s - 1) as Stage];
              return (
                <button
                  key={s}
                  disabled={locked}
                  onClick={() => setActiveStage(s)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-all",
                    locked ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:border-primary/40",
                    active ? "border-primary/60 bg-primary/5" : "border-border bg-surface"
                  )}
                  style={active ? { borderColor: meta.color + "80", background: meta.color + "10" } : undefined}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold" style={{ color: meta.color }}>{meta.label}</span>
                    {done && <CheckCircle2 className="h-3 w-3" style={{ color: meta.color }} />}
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="text-xs font-medium mt-1">{meta.sub}</div>
                  <div className="text-[10px] text-muted-foreground">{meta.time}</div>
                </button>
              );
            })}
          </div>

          {/* Active stage panel */}
          <div
            className="rounded-xl border p-4 space-y-3"
            style={{ borderColor: STAGE_META[activeStage].color + "40", background: STAGE_META[activeStage].color + "06" }}
          >
            <p className="text-xs text-muted-foreground leading-relaxed">{STAGE_META[activeStage].desc}</p>
            <Button
              onClick={() => runStage(activeStage)}
              disabled={!fetched || stageLoading !== null}
              className="gap-2"
              style={{ background: STAGE_META[activeStage].color, color: "#001a0d" }}
            >
              {stageLoading === activeStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Run Stage {activeStage} analysis
              <ArrowRight className="h-3 w-3" />
            </Button>
            {!fetched && (
              <p className="text-[10px] text-yellow-500 font-mono">Connect to a vehicle first.</p>
            )}
          </div>

          {sanStats && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <span><Shield className="h-3 w-3 inline mr-1 text-yellow-500" />{sanStats.identifiersTokenized} tokens</span>
              <span>{sanStats.commentsStripped} comments stripped</span>
              <span>{sanStats.secretsBlocked} secrets blocked</span>
            </div>
          )}

          {/* Results */}
          {results[1] && <Stage1View r={results[1]} />}
          {results[2] && <Stage2View r={results[2]} />}
          {results[3] && <Stage3View r={results[3]} />}

          {!results[1] && !stageLoading && (
            <div className="text-center py-16 text-muted-foreground">
              <Terminal className="h-10 w-10 mx-auto mb-3 text-primary/30" />
              <p className="text-sm">Connect to a vehicle, describe the failure, then run Stage 1.</p>
              <p className="text-xs mt-1">Within 30 seconds you'll have hypotheses to grep against logs.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

async function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Response) {
    return `${error.status} ${await error.text().catch(() => error.statusText || fallback)}`;
  }

  const message = (error as { message?: string } | null)?.message;
  return message && message !== "[object Response]" ? message : fallback;
}

function Stage1View({ r }: { r: Stage1Result }) {
  const c = STAGE_META[1].color;
  return (
    <section className="rounded-xl border p-5 space-y-4" style={{ borderColor: c + "40", background: c + "06" }}>
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: c }}>
        <Sparkles className="h-3 w-3" /> Stage 1 — Code-only hypotheses
      </div>
      <p className="text-sm font-semibold">{r.summary}</p>
      {r.critical_path?.length > 0 && (
        <div className="text-xs font-mono text-muted-foreground">
          Critical path: {r.critical_path.join(" → ")}
        </div>
      )}
      <div className="space-y-2">
        {r.hypotheses.map((h) => (
          <div key={h.id} className="rounded-lg border border-border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded" style={confColor(h.confidence)}>
                {h.confidence}
              </span>
              <span className="text-xs font-semibold">{h.id} · {h.title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{h.mechanism}</p>
            <div className="text-[11px] font-mono bg-surface rounded p-2 text-foreground/80">
              <span className="text-yellow-500">code:</span> {h.code_evidence}
            </div>
            {h.log_signatures?.length > 0 && (
              <div className="text-[11px] font-mono text-muted-foreground">
                grep for: {h.log_signatures.map((s, i) => <code key={i} className="mx-1 px-1.5 py-0.5 rounded bg-surface text-primary">{s}</code>)}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground italic">eliminates if: {h.eliminates_if}</div>
          </div>
        ))}
      </div>
      {r.what_to_grep?.length > 0 && (
        <div className="rounded-md bg-background border border-border p-3 text-[11px] font-mono">
          <div className="text-muted-foreground uppercase text-[10px] tracking-widest mb-1">What to grep in logs</div>
          <div className="flex flex-wrap gap-1.5">
            {r.what_to_grep.map((g, i) => <code key={i} className="px-1.5 py-0.5 rounded bg-surface text-primary">{g}</code>)}
          </div>
        </div>
      )}
    </section>
  );
}

function Stage2View({ r }: { r: Stage2Result }) {
  const c = STAGE_META[2].color;
  return (
    <section className="rounded-xl border p-5 space-y-4" style={{ borderColor: c + "40", background: c + "06" }}>
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: c }}>
        <Database className="h-3 w-3" /> Stage 2 — Logs correlated
      </div>
      <p className="text-sm font-semibold">{r.summary}</p>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Timeline</div>
        <div className="space-y-1">
          {r.timeline.map((e, i) => (
            <div key={i} className="grid grid-cols-[60px_1fr] gap-3 text-xs items-baseline">
              <span className="font-mono text-yellow-500">{e.offset}</span>
              <div>
                <span>{e.event}</span>
                <div className="text-[10px] text-muted-foreground font-mono">{e.source}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">Hypothesis verdicts</div>
        <div className="space-y-1.5">
          {r.hypothesis_verdicts.map((v, i) => (
            <div key={i} className="rounded-md border border-border bg-background p-2 text-xs flex gap-2">
              <span className="font-mono font-bold" style={verdictColor(v.verdict)}>
                {v.verdict === "CONFIRMED" ? <CheckCircle2 className="h-3 w-3 inline" /> :
                 v.verdict === "ELIMINATED" ? <XCircle className="h-3 w-3 inline" /> :
                 <AlertTriangle className="h-3 w-3 inline" />}
                {" "}{v.id}
              </span>
              <span className="text-muted-foreground flex-1">{v.evidence}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1.5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-primary">Root cause</div>
        <div className="text-sm font-semibold"><FileCode className="h-3.5 w-3.5 inline mr-1" />{r.root_cause.function} <span className="text-muted-foreground text-xs font-normal">({r.root_cause.line_hint})</span></div>
        <p className="text-xs leading-relaxed">{r.root_cause.mechanism}</p>
        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded inline-block" style={confColor(r.root_cause.confidence)}>
          {r.root_cause.confidence} confidence
        </span>
      </div>

      <div className="text-xs text-muted-foreground italic">What the vehicle saw: {r.what_vehicle_saw}</div>
    </section>
  );
}

function Stage3View({ r }: { r: Stage3Result }) {
  const c = STAGE_META[3].color;
  const layerColors: Record<string, string> = { SENSING: "#44aaff", PROCESSING: "#ffaa00", PLANNING: "#aa88ff", CONTROL: "#ff4444" };
  return (
    <section className="rounded-xl border p-5 space-y-4" style={{ borderColor: c + "40", background: c + "06" }}>
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest" style={{ color: c }}>
        <Activity className="h-3 w-3" /> Stage 3 — Definitive
      </div>
      <p className="text-sm font-semibold">{r.summary}</p>

      <div className="inline-block rounded-md px-3 py-1 text-[11px] font-mono uppercase tracking-widest font-bold"
           style={{ background: (layerColors[r.failure_layer] ?? "#888") + "20", color: layerColors[r.failure_layer] ?? "#888" }}>
        Failure layer: {r.failure_layer}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-background border border-border p-2.5">
          <div className="text-[10px] font-mono uppercase text-muted-foreground">Vehicle saw</div>
          <div className="mt-1">{r.perception_state.what_vehicle_saw}</div>
        </div>
        <div className="rounded-md bg-background border border-border p-2.5">
          <div className="text-[10px] font-mono uppercase text-muted-foreground">Should have seen</div>
          <div className="mt-1">{r.perception_state.what_it_should_have_seen}</div>
        </div>
        <div className="rounded-md bg-severity-critical/10 border border-severity-critical/40 p-2.5">
          <div className="text-[10px] font-mono uppercase text-severity-critical">Discrepancy</div>
          <div className="mt-1">{r.perception_state.discrepancy}</div>
        </div>
      </div>

      <div className="space-y-1">
        {r.full_chain.map((c, i) => (
          <div key={i} className="rounded-md border border-border bg-background p-2.5 text-xs">
            <div className="font-mono uppercase text-[10px] tracking-widest" style={{ color: layerColors[c.layer.toUpperCase()] ?? "#888" }}>
              {c.layer}
            </div>
            <div className="grid grid-cols-3 gap-2 mt-1 text-[11px]">
              <div><span className="text-muted-foreground">in:</span> {c.input}</div>
              <div><span className="text-muted-foreground">out:</span> {c.output}</div>
              <div className={c.issue ? "text-severity-critical" : "text-muted-foreground"}>
                {c.issue || "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-primary">Definitive cause</div>
        <div className="text-sm font-semibold">{r.definitive_cause.function}</div>
        <p className="text-xs leading-relaxed">{r.definitive_cause.mechanism}</p>
      </div>

      <div className="rounded-lg border border-severity-low/40 bg-severity-low/5 p-3 text-xs">
        <div className="text-[10px] font-mono uppercase tracking-widest text-severity-low mb-1">Fix</div>
        <p className="leading-relaxed">{r.fix}</p>
      </div>

      <div className="rounded-lg border border-border bg-background p-3 text-xs">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Regression test</div>
        <p className="leading-relaxed font-mono">{r.test_case}</p>
      </div>
    </section>
  );
}

function confColor(c: "High" | "Medium" | "Low") {
  if (c === "High") return { background: "rgba(255,68,68,0.15)", color: "#ff6666" };
  if (c === "Medium") return { background: "rgba(255,170,0,0.15)", color: "#ffaa00" };
  return { background: "rgba(68,170,255,0.15)", color: "#44aaff" };
}
function verdictColor(v: "CONFIRMED" | "ELIMINATED" | "POSSIBLE") {
  if (v === "CONFIRMED") return { color: "#4af0c4" };
  if (v === "ELIMINATED") return { color: "#ff6666" };
  return { color: "#ffaa00" };
}
