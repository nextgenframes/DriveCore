import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { GitBranch, Play, RotateCcw, Shield, ChevronLeft, ChevronRight, Check, Loader2, Sparkles, FileCode, ExternalLink, Copy, Eye, ArrowRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { debugBranch, type DebugResult, type Suspect } from "@/server/branch-debug.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/branch-debug")({
  component: BranchDebugPage,
});

type Zone = "user" | "server" | "ai";

const STEPS: {
  id: number; label: string; sublabel: string; color: string; icon: string;
  zone: Zone; code: string; detail: string; codeLabel: string;
}[] = [
  { id: 1, label: "Engineer runs git diff", sublabel: "After a failed deploy or test", color: "#4af0c4", icon: "⌥", zone: "user",
    code: `git diff main..feature/checkout-fix > diff.txt`,
    detail: "The engineer notices something broke after merging a branch. They grab the diff between their branch and main — this captures every line that changed.",
    codeLabel: "TERMINAL" },
  { id: 2, label: "Paste diff + describe failure", sublabel: "Plain English note", color: "#4af0c4", icon: "✎", zone: "user",
    code: `"API throwing 500 on /checkout after deploy.\nCard validation seems broken for Amex cards."`,
    detail: "The engineer pastes the diff into BranchDebug and writes a plain-English description of what broke. No special format — just what they observed.",
    codeLabel: "INPUT" },
  { id: 3, label: "IP Shield — Sanitizer runs", sublabel: "Server-side, before any external call", color: "#ffcc44", icon: "🛡", zone: "server",
    code: `validate_card()  →  fn_0042\nAmexValidator   →  fn_0019\ncard_number     →  fn_0003\n\n# Comments stripped\n# Secrets blocked`,
    detail: "BEFORE the diff reaches any AI, the server strips all identifiers and replaces them with anonymous tokens. Comments are removed. The token map is encrypted and stored locally — it never leaves your server.",
    codeLabel: "SANITIZER OUTPUT" },
  { id: 4, label: "Sanitized diff sent to AI", sublabel: "Zero data retention API tier", color: "#aa88ff", icon: "→", zone: "ai",
    code: `diff --git a/fn_0019.py b/fn_0019.py\n-  if fn_0003 > 15:\n+  if fn_0003 > 16:`,
    detail: "Only the anonymized diff — with no real function names, file paths, or comments — is sent to the AI API. Even if this were intercepted, it reveals nothing about your codebase.",
    codeLabel: "PAYLOAD SENT TO AI" },
  { id: 5, label: "AI analyzes failure pattern", sublabel: "Root cause mapping", color: "#aa88ff", icon: "◎", zone: "ai",
    code: `{\n  "suspect": "fn_0019 :: fn_0042",\n  "confidence": "High",\n  "mechanism": "Threshold change\n    from 15→16 excludes valid\n    fn_0003 lengths"\n}`,
    detail: "The AI cross-references the anonymized diff against the failure description. It identifies which changed lines are most likely responsible and explains the mechanism.",
    codeLabel: "AI RESPONSE (anonymized)" },
  { id: 6, label: "Token map restores real names", sublabel: "Encrypted map decrypted server-side", color: "#ffcc44", icon: "↺", zone: "server",
    code: `fn_0019  →  AmexValidator\nfn_0042  →  validate_card\nfn_0003  →  card_number`,
    detail: "The server decrypts the token map and replaces all anonymous tokens in the AI response with your real function and file names. The real-name mapping never left your server.",
    codeLabel: "TOKEN RESTORATION" },
  { id: 7, label: "Results shown to engineer", sublabel: "Ranked suspects + auto Jira ticket", color: "#4af0c4", icon: "✓", zone: "user",
    code: `HIGH  payments/AmexValidator.py\n      :: validate_card()\n\nThreshold change 15→16 excludes\nvalid 15-digit Amex card_numbers`,
    detail: "The engineer sees real file paths, real function names, confidence scores, and a plain-English explanation of why each change causes the observed failure. One click creates a Jira ticket.",
    codeLabel: "RESULT" },
];

const ZONES: Record<Zone, { label: string; color: string }> = {
  user:   { label: "YOUR MACHINE", color: "#4af0c4" },
  server: { label: "YOUR SERVER (IP SHIELD)", color: "#ffcc44" },
  ai:     { label: "AI API (anonymized only)", color: "#aa88ff" },
};

function BranchDebugPage() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([0]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setActive((prev) => {
          const next = prev + 1;
          if (next >= STEPS.length) {
            setPlaying(false);
            if (timerRef.current) clearInterval(timerRef.current);
            return prev;
          }
          setRevealed((r) => (r.includes(next) ? r : [...r, next]));
          return next;
        });
      }, 1800);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing]);

  const handleStep = (i: number) => {
    setActive(i);
    setRevealed((r) => (r.includes(i) ? r : [...r, i]));
    setPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handlePlay = () => {
    if (active >= STEPS.length - 1) {
      setActive(0);
      setRevealed([0]);
    }
    setPlaying(true);
  };

  const handleReset = () => {
    setActive(0);
    setRevealed([0]);
    setPlaying(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const step = STEPS[active];
  const zone = ZONES[step.zone];

  // ─── Analyzer state ───
  const [tab, setTab] = useState<"analyzer" | "cli" | "howto">("analyzer");
  const [diff, setDiff] = useState("");
  const [failure, setFailure] = useState("");
  const [result, setResult] = useState<DebugResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editorBase, setEditorBase] = useState(() => localStorage.getItem("branchdebug.editorBase") ?? "vscode://file/");
  const debugFn = useServerFn(debugBranch);

  const runAnalysis = async () => {
    if (!diff.trim() || !failure.trim()) {
      toast.error("Provide both a diff and a failure description.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await debugFn({ data: { diff, failureDescription: failure } });
      setResult(res);
      toast.success(`Found ${res.suspects.length} suspect${res.suspects.length === 1 ? "" : "s"}`);
    } catch (e: any) {
      toast.error(e.message ?? "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const loadSample = () => {
    setDiff(`diff --git a/payments/AmexValidator.py b/payments/AmexValidator.py
index 1a2b3c4..5d6e7f8 100644
--- a/payments/AmexValidator.py
+++ b/payments/AmexValidator.py
@@ -10,7 +10,7 @@ class AmexValidator:
     def validate_card(self, card_number):
         # Amex cards are 15 digits
-        if len(card_number) > 15:
+        if len(card_number) > 16:
             return False
         return self._luhn_check(card_number)
diff --git a/checkout/handler.py b/checkout/handler.py
index aaa..bbb 100644
--- a/checkout/handler.py
+++ b/checkout/handler.py
@@ -42,6 +42,7 @@ def process_checkout(payload):
     validator = AmexValidator()
+    payload = sanitize_payload(payload)
     if not validator.validate_card(payload["card"]):
         raise ValueError("Invalid card")`);
    setFailure("API throwing 500 on /checkout after deploy. Card validation seems broken for Amex cards.");
  };

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Engineering</div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" /> Branch Debug
          </h1>
        </div>
        <div className="flex gap-1 p-1 rounded-lg bg-surface border border-border">
          <button
            onClick={() => setTab("analyzer")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest transition-colors",
              tab === "analyzer" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Sparkles className="h-3 w-3 inline mr-1.5" /> Analyzer
          </button>
          <button
            onClick={() => setTab("cli")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest transition-colors",
              tab === "cli" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <FileCode className="h-3 w-3 inline mr-1.5" /> VS Code
          </button>
          <button
            onClick={() => setTab("howto")}
            className={cn("px-3 py-1.5 rounded-md text-xs font-mono uppercase tracking-widest transition-colors",
              tab === "howto" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            How it works
          </button>
        </div>
      </header>

      {tab === "analyzer" && (
        <AnalyzerView
          diff={diff} setDiff={setDiff}
          failure={failure} setFailure={setFailure}
          result={result} analyzing={analyzing}
          onRun={runAnalysis} onSample={loadSample}
          editorBase={editorBase} setEditorBase={(v) => { setEditorBase(v); localStorage.setItem("branchdebug.editorBase", v); }}
        />
      )}

      {tab === "cli" && <CliView />}

      {tab === "howto" && (
      <>
      <div className="px-8 py-3 border-b border-border flex justify-end gap-2 bg-surface/20">
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-widest border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Play className="h-3 w-3" /> {playing ? "Playing…" : "Auto-Play"}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-2 rounded-md text-xs font-mono uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-0 overflow-hidden">
        {/* Left: pipeline */}
        <div className="border-r border-border overflow-y-auto p-4 space-y-2 bg-surface/20">
          <div className="px-2 pb-3 space-y-1.5">
            {(Object.entries(ZONES) as [Zone, typeof ZONES[Zone]][]).map(([k, z]) => (
              <div key={k} className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: z.color }} />
                {z.label}
              </div>
            ))}
          </div>

          {STEPS.map((s, i) => {
            const isActive = active === i;
            const isRevealed = revealed.includes(i);
            const z = ZONES[s.zone];
            const showZoneHeader = i === 0 || STEPS[i - 1].zone !== s.zone;
            return (
              <div key={s.id}>
                {showZoneHeader && (
                  <div className="px-2 pt-3 pb-1 text-[9px] font-mono uppercase tracking-widest" style={{ color: z.color }}>
                    ── {z.label} ──
                  </div>
                )}
                <button
                  onClick={() => handleStep(i)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border flex items-start gap-3 transition-all",
                    isActive ? "border-primary/60 bg-primary/5 shadow-[var(--shadow-glow)]" :
                    isRevealed ? "border-border bg-surface hover:border-primary/30" :
                    "border-border/40 bg-surface/30 opacity-50"
                  )}
                  style={isActive ? { borderColor: s.color + "80", background: s.color + "12" } : undefined}
                >
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold font-mono shrink-0"
                    style={{
                      background: isActive ? s.color : isRevealed ? s.color + "30" : "hsl(var(--muted))",
                      color: isActive ? "#001a0d" : s.color,
                    }}
                  >
                    {s.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{s.sublabel}</div>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div className="ml-[26px] h-3 w-px bg-border" />
                )}
              </div>
            );
          })}
        </div>

        {/* Right: detail */}
        <div className="overflow-y-auto p-8 space-y-6 max-w-4xl">
          <div className="flex items-start gap-4">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ background: step.color + "20", color: step.color, border: `1px solid ${step.color}40` }}
            >
              {step.icon}
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Step {step.id} of {STEPS.length} — {zone.label}
              </div>
              <h2 className="text-2xl font-bold tracking-tight">{step.label}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed pt-2 max-w-2xl">{step.detail}</p>
            </div>
          </div>

          {/* Code block */}
          <div className="rounded-xl border border-border bg-surface overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-background/40 text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center justify-between">
              <span>{step.codeLabel}</span>
              <span style={{ color: step.color }}>● {step.zone.toUpperCase()}</span>
            </div>
            <pre className="p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed text-foreground/90 overflow-x-auto">
              {step.code}
            </pre>
          </div>

          {/* IP Shield callout */}
          {(step.id === 3 || step.id === 6) && (
            <div className="rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4">
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-yellow-500 font-bold mb-2">
                <Shield className="h-3.5 w-3.5" /> IP Shield Active
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step.id === 3
                  ? "Real names are replaced with opaque tokens BEFORE any data leaves your server. The token map is encrypted with AES-256-GCM using a key derived from your org ID. It is never transmitted anywhere."
                  : "The token map is decrypted on your server using your org's encryption key. Real identifiers are restored locally. The AI never saw — and still doesn't know — your actual function or file names."}
              </p>
            </div>
          )}

          {/* Pipeline progress */}
          <div className="rounded-xl border border-border bg-surface/60 p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3">Pipeline Progress</div>
            <div className="flex items-center gap-1">
              {STEPS.map((s, i) => {
                const isDone = i < active;
                const isCurrent = i === active;
                return (
                  <div key={s.id} className="flex items-center flex-1 last:flex-initial">
                    <div
                      className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0",
                        isCurrent && "ring-2 ring-offset-2 ring-offset-background"
                      )}
                      style={{
                        background: isDone || isCurrent ? s.color : "hsl(var(--muted))",
                        color: isDone || isCurrent ? "#001a0d" : "hsl(var(--muted-foreground))",
                        ...(isCurrent ? ({ "--tw-ring-color": s.color } as React.CSSProperties) : {}),
                      }}
                    >
                      {isDone ? <Check className="h-3 w-3" /> : s.id}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        className="flex-1 h-px mx-1"
                        style={{ background: i < active ? s.color : "hsl(var(--border))" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between gap-2 pt-2">
            <button
              onClick={() => handleStep(Math.max(0, active - 1))}
              disabled={active === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-3 w-3" /> Prev
            </button>
            <button
              onClick={() => handleStep(Math.min(STEPS.length - 1, active + 1))}
              disabled={active === STEPS.length - 1}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-mono uppercase tracking-widest font-bold disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: active === STEPS.length - 1 ? "hsl(var(--muted))" : step.color,
                color: active === STEPS.length - 1 ? "hsl(var(--muted-foreground))" : "#001a0d",
              }}
            >
              Next <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Analyzer view component */}
      <AnalyzerStyles />
    </>
  );
}

function AnalyzerStyles() { return null; }

function CliView() {
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/public/branch-debug` : "/api/public/branch-debug";
  const install = `curl -fsSL ${endpoint.replace("/api/public/branch-debug", "/cli/eventdash-debug.mjs")} -o eventdash-debug.mjs`;
  const run = `node ./eventdash-debug.mjs "Checkout 500s on Amex cards after deploy"`;
  const runCursor = `node ./eventdash-debug.mjs --editor cursor "..."`;
  const runBase = `node ./eventdash-debug.mjs --base origin/main "..."`;

  const Block = ({ cmd }: { cmd: string }) => (
    <div className="group relative rounded-lg border border-border bg-[#0a0e15] p-4 font-mono text-xs text-foreground">
      <pre className="whitespace-pre-wrap break-all">{cmd}</pre>
      <button
        onClick={() => { navigator.clipboard.writeText(cmd); toast.success("Copied"); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded bg-surface border border-border hover:border-primary/50"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );

  const downloadExtension = () => {
    fetch("/branchdebug-vscode-extension.zip")
      .then((res) => { if (!res.ok) throw new Error(`Download failed: ${res.status}`); return res.blob(); })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "branchdebug-vscode-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
        toast.success("Extension downloaded");
      })
      .catch((err) => toast.error(err.message));
  };

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" /> Run Branch Debug from VS Code
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Two ways to connect your editor: install the official VS Code extension, or use the lightweight terminal helper.
          </p>
        </div>

        {/* Option A: Extension */}
        <section className="rounded-xl border border-primary/40 bg-primary/5 p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-primary font-mono">Recommended</div>
              <h3 className="text-lg font-semibold mt-0.5">BranchDebug VS Code Extension</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                Sidebar panel, inline highlights, and one-click navigation to every suspect line. Works with VS Code, Cursor, and other Code-based editors.
              </p>
            </div>
            <Button onClick={downloadExtension} className="shrink-0">
              <ExternalLink className="h-4 w-4 mr-2" /> Download .zip
            </Button>
          </div>

          <div className="rounded-lg bg-[#0a0e15] border border-border p-4 text-xs text-foreground space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Install (unpacked)</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Unzip the downloaded file.</li>
              <li>In VS Code / Cursor, open the unzipped folder and run <code className="text-primary">npm install &amp;&amp; npm run compile</code>.</li>
              <li>Press <code className="text-primary">F5</code> to launch an Extension Development Host, or run <code className="text-primary">vsce package</code> and install the resulting <code className="text-primary">.vsix</code>.</li>
              <li>Open the BranchDebug sidebar → set <code className="text-primary">serverUrl</code> to <code className="text-primary">{endpoint.replace("/api/public/branch-debug", "")}</code>.</li>
            </ol>
          </div>

          <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-md bg-surface/50 border border-border p-2">
              <div className="font-mono text-primary">Analyze Current Branch</div>
              <div className="text-muted-foreground mt-0.5">Run analysis on your current branch.</div>
            </div>
            <div className="rounded-md bg-surface/50 border border-border p-2">
              <div className="font-mono text-primary">URI handler</div>
              <div className="text-muted-foreground mt-0.5">Opens <code>branchdebug://</code> deep links.</div>
            </div>
            <div className="rounded-md bg-surface/50 border border-border p-2">
              <div className="font-mono text-primary">Inline highlights</div>
              <div className="text-muted-foreground mt-0.5">Suspect lines decorated in the editor.</div>
            </div>
          </div>
        </section>

        {/* Option B: CLI */}
        <section className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Alternative</div>
            <h3 className="text-base font-semibold mt-0.5">Terminal helper (no install)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">For CI, headless servers, or when you don't want an extension.</p>
          </div>
          <Block cmd={install} />
          <Block cmd={run} />
          <div className="grid sm:grid-cols-2 gap-2">
            <Block cmd={runCursor} />
            <Block cmd={runBase} />
          </div>
        </section>

        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground flex gap-3">
          <Shield className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            Both paths send your diff through the same IP Shield — identifiers tokenized, comments stripped, secrets blocked — before any AI sees it. Real file paths and line numbers are restored locally.
          </div>
        </div>
      </div>
    </div>
  );
}


const CONFIDENCE_STYLES = {
  high: { bg: "bg-severity-critical/10", border: "border-severity-critical/40", text: "text-severity-critical", dot: "bg-severity-critical" },
  medium: { bg: "bg-severity-high/10", border: "border-severity-high/40", text: "text-severity-high", dot: "bg-severity-high" },
  low: { bg: "bg-muted/30", border: "border-border", text: "text-muted-foreground", dot: "bg-muted-foreground" },
} as const;

function AnalyzerView({
  diff, setDiff, failure, setFailure, result, analyzing, onRun, onSample, editorBase, setEditorBase,
}: {
  diff: string; setDiff: (v: string) => void;
  failure: string; setFailure: (v: string) => void;
  result: DebugResult | null; analyzing: boolean;
  onRun: () => void; onSample: () => void;
  editorBase: string; setEditorBase: (v: string) => void;
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[480px_1fr] min-h-0 overflow-hidden">
      {/* Input panel */}
      <div className="border-r border-border overflow-y-auto p-6 space-y-4 bg-surface/20">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Unified git diff</label>
            <button onClick={onSample} className="text-[10px] font-mono uppercase tracking-widest text-primary hover:underline">Load sample</button>
          </div>
          <Textarea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            placeholder="Paste output of `git diff main..feature/...`"
            className="font-mono text-xs h-64 resize-none bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Failure description</label>
          <Textarea
            value={failure}
            onChange={(e) => setFailure(e.target.value)}
            placeholder="What broke? Stack trace, error message, observed behavior…"
            className="text-sm h-28 resize-none bg-background"
          />
        </div>
        <div>
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 block">Editor deep-link prefix</label>
          <input
            value={editorBase}
            onChange={(e) => setEditorBase(e.target.value)}
            className="w-full text-xs font-mono px-3 py-2 rounded-md bg-background border border-border focus:border-primary outline-none"
            placeholder="vscode://file/  or  cursor://file/"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Used to jump directly to suspect lines in your editor.</p>
        </div>
        <Button onClick={onRun} disabled={analyzing} className="w-full gap-2">
          {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze branch</>}
        </Button>
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 flex gap-2 text-[11px] text-muted-foreground">
          <Shield className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
          <span>Identifiers, comments, and secrets are stripped server-side before any AI call. Real names are restored locally after analysis.</span>
        </div>
      </div>

      {/* Results panel */}
      <div className="overflow-y-auto p-8 space-y-5 max-w-4xl">
        {!result && !analyzing && (
          <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-24">
            <Sparkles className="h-10 w-10 mb-4 text-primary/40" />
            <p className="text-sm font-medium">Paste a diff and describe the failure</p>
            <p className="text-xs mt-1">BranchDebug will rank suspect changes by likely root cause.</p>
          </div>
        )}

        {analyzing && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium text-sm">Sanitizing diff and analyzing…</p>
              <p className="text-xs text-muted-foreground">Tokenize → AI ranks suspects → restore real names</p>
            </div>
          </div>
        )}

        {result && (
          <>
            <div className="rounded-xl border border-border bg-surface/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Verdict</div>
                <AuditModalTrigger audit={result.audit} stats={result.sanitizationStats} />
              </div>
              <p className="text-sm leading-relaxed">{result.summary}</p>
              <div className="flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground pt-2 border-t border-border">
                <span><Shield className="h-3 w-3 inline mr-1 text-yellow-500" />{result.sanitizationStats.identifiersTokenized} identifiers tokenized</span>
                <span>{result.sanitizationStats.commentsStripped} comment lines stripped</span>
                <span>{result.sanitizationStats.secretsBlocked} secrets blocked</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Ranked suspects ({result.suspects.length})</div>
              {result.suspects.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suspect changes identified.</p>
              ) : (
                result.suspects.map((s, i) => <SuspectCard key={i} suspect={s} editorBase={editorBase} rank={i + 1} />)
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SuspectCard({ suspect, editorBase, rank }: { suspect: Suspect; editorBase: string; rank: number }) {
  const c = CONFIDENCE_STYLES[suspect.confidence];
  const link = `${editorBase}${suspect.filePath}:${suspect.lineStart}`;

  const copyLocation = () => {
    navigator.clipboard.writeText(`${suspect.filePath}:${suspect.lineStart}`);
    toast.success("Location copied");
  };

  return (
    <div className={cn("rounded-xl border p-5 space-y-3", c.border, c.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold font-mono shrink-0", c.text, "bg-background border", c.border)}>
            #{rank}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-[10px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded", c.bg, c.text, "border", c.border)}>
                <span className={cn("inline-block h-1.5 w-1.5 rounded-full mr-1.5", c.dot)} />
                {suspect.confidence}
              </span>
              <span className="text-sm font-semibold">{suspect.changeSummary}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground mt-1.5 min-w-0">
              <FileCode className="h-3 w-3 shrink-0" />
              <span className="truncate">{suspect.filePath}</span>
              <span className="text-primary">:{suspect.lineStart}{suspect.lineEnd !== suspect.lineStart && `-${suspect.lineEnd}`}</span>
              {suspect.functionName && <span className="text-muted-foreground/60">· {suspect.functionName}()</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={copyLocation}
            className="h-7 w-7 rounded-md border border-border bg-background hover:bg-surface flex items-center justify-center text-muted-foreground hover:text-foreground"
            title="Copy location"
          >
            <Copy className="h-3 w-3" />
          </button>
          <a
            href={link}
            className="h-7 px-2 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
            title="Open in editor"
          >
            <ExternalLink className="h-3 w-3" /> Jump
          </a>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-foreground/90">{suspect.mechanism}</p>

      {(suspect.beforeSnippet || suspect.afterSnippet) && (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <pre className="text-[11px] font-mono leading-relaxed">
            {suspect.beforeSnippet?.split("\n").map((l, i) => (
              <div key={`b${i}`} className="px-3 py-0.5 text-severity-critical bg-severity-critical/5">- {l}</div>
            ))}
            {suspect.afterSnippet?.split("\n").map((l, i) => (
              <div key={`a${i}`} className="px-3 py-0.5 text-severity-low bg-severity-low/5">+ {l}</div>
            ))}
          </pre>
        </div>
      )}
    </div>
  );
}


function AuditModalTrigger({ audit, stats }: { audit: DebugResult["audit"]; stats: DebugResult["sanitizationStats"] }) {
  const [tab, setTab] = useState<"tokens" | "comments" | "secrets" | "diff">("tokens");
  const sampleOriginalLines = audit.sample.original.split("\n");
  const sampleSanitizedLines = audit.sample.sanitized.split("\n");
  const maxLines = Math.max(sampleOriginalLines.length, sampleSanitizedLines.length);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-mono uppercase tracking-widest border border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 transition-colors">
          <Eye className="h-3 w-3" /> View audit
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-yellow-500" /> IP Shield Audit
          </DialogTitle>
          <DialogDescription className="text-xs">
            Everything that was sanitized before the diff reached the AI. Real names and secrets never left your server.
          </DialogDescription>
        </DialogHeader>

        {/* Stats strip */}
        <div className="grid grid-cols-3 border-b border-border">
          <StatCell label="Identifiers tokenized" value={stats.identifiersTokenized} />
          <StatCell label="Comment lines stripped" value={stats.commentsStripped} />
          <StatCell label="Secrets blocked" value={stats.secretsBlocked} highlight={stats.secretsBlocked > 0} />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 border-b border-border">
          {([
            ["tokens", `Token map (${audit.tokenMap.length})`],
            ["comments", `Comments (${audit.redactedComments.length})`],
            ["secrets", `Secrets (${audit.secretMatches.length})`],
            ["diff", "Before / After"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={cn(
                "px-3 py-2 text-[11px] font-mono uppercase tracking-wider border-b-2 transition-colors",
                tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6">
            {tab === "tokens" && (
              audit.tokenMap.length === 0 ? (
                <p className="text-sm text-muted-foreground">No identifiers were tokenized.</p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_2fr_auto] gap-3 px-4 py-2 bg-surface text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                    <span>Token sent to AI</span><span></span><span>Real identifier (local only)</span><span>Uses</span>
                  </div>
                  {audit.tokenMap.map((e) => (
                    <div key={e.token} className="grid grid-cols-[1fr_auto_2fr_auto] gap-3 px-4 py-2 text-xs font-mono items-center border-b border-border last:border-b-0 hover:bg-surface/50">
                      <code className="text-primary">{e.token}</code>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <code className="text-foreground truncate">{e.real}</code>
                      <span className="text-muted-foreground tabular-nums">{e.occurrences}×</span>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === "comments" && (
              audit.redactedComments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No comments were stripped.</p>
              ) : (
                <ul className="space-y-1.5">
                  {audit.redactedComments.map((c, i) => (
                    <li key={i} className="rounded-md border border-border bg-surface/40 px-3 py-2 text-xs font-mono text-muted-foreground">
                      <span className="text-yellow-500">×</span> {c}
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "secrets" && (
              audit.secretMatches.length === 0 ? (
                <div className="rounded-lg border border-severity-low/30 bg-severity-low/5 p-4 text-sm flex items-center gap-2 text-severity-low">
                  <Check className="h-4 w-4" /> No secret patterns detected in the diff.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground mb-2">Only the pattern type and length are recorded. The original values were destroyed before reaching this view.</p>
                  {audit.secretMatches.map((s, i) => (
                    <div key={i} className="rounded-md border border-severity-critical/30 bg-severity-critical/5 px-3 py-2 flex items-center justify-between text-xs font-mono">
                      <span className="text-severity-critical font-semibold">{s.pattern}</span>
                      <span className="text-muted-foreground">{s.replaced}</span>
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === "diff" && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Side-by-side preview (first {maxLines} lines). Left = local, right = exactly what the AI saw.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-border bg-surface/40 overflow-hidden">
                    <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-surface border-b border-border">Local (real)</div>
                    <pre className="text-[11px] font-mono p-3 leading-relaxed whitespace-pre overflow-x-auto">
                      {sampleOriginalLines.map((l, i) => (
                        <div key={i} className="flex">
                          <span className="text-muted-foreground/40 w-8 shrink-0 select-none">{i + 1}</span>
                          <span>{l || " "}</span>
                        </div>
                      ))}
                    </pre>
                  </div>
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 overflow-hidden">
                    <div className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest bg-yellow-500/10 border-b border-yellow-500/30 text-yellow-500">Sent to AI (sanitized)</div>
                    <pre className="text-[11px] font-mono p-3 leading-relaxed whitespace-pre overflow-x-auto">
                      {sampleSanitizedLines.map((l, i) => (
                        <div key={i} className="flex">
                          <span className="text-muted-foreground/40 w-8 shrink-0 select-none">{i + 1}</span>
                          <span dangerouslySetInnerHTML={{
                            __html: (l || " ").replace(/(fn_\d{4})/g, '<span class="text-primary">$1</span>')
                              .replace(/(\[SECRET_REDACTED\])/g, '<span class="text-severity-critical font-bold">$1</span>')
                          }} />
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function StatCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="px-6 py-3 border-r border-border last:border-r-0">
      <div className={cn("text-2xl font-bold tabular-nums", highlight ? "text-severity-critical" : "text-foreground")}>{value}</div>
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
