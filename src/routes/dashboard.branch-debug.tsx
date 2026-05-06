import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { GitBranch, Play, RotateCcw, Shield, ChevronLeft, ChevronRight, Check, Loader2, Sparkles, FileCode, ExternalLink, Copy, Eye, ArrowRight, Download, FileJson, FileText, Terminal, Edit3, Lock, Send, Brain, Unlock, Target, Ticket, Link2, Paperclip, type LucideIcon } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { debugBranch, debugSnippet, type DebugResult, type Suspect } from "@/server/branch-debug.functions";
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

const LANGUAGES = [
  { id: "auto", label: "Auto-detect language" },
  { id: "python", label: "Python" },
  { id: "cpp", label: "C / C++" },
  { id: "typescript", label: "TypeScript / JS" },
  { id: "rust", label: "Rust" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
];

function detectInputType(text: string): "diff" | "snippet" | "unknown" {
  if (!text || text.trim().length < 10) return "unknown";
  const lines = text.trim().split("\n");
  const diffHeaders = lines.filter((l) => /^(diff --git|---\s|\+\+\+\s|@@\s|index [a-f0-9])/.test(l)).length;
  const diffLines = lines.filter((l) => /^[+\-](?![+\-])/.test(l)).length;
  if (diffHeaders >= 1 || (diffLines / lines.length > 0.3 && diffLines >= 3)) return "diff";
  return "snippet";
}

type Track = "diff" | "snippet" | "both";

const STEPS: {
  id: number; label: string; sublabel: string; color: string; Icon: LucideIcon;
  zone: Zone; code: string; detail: string; codeLabel: string; track: Track;
}[] = [
  { id: 1, label: "Capture the failing change", sublabel: "git diff — or any code snippet", color: "#4af0c4", Icon: Terminal, zone: "user", track: "both",
    code: `# Diff mode\ngit diff main..feature/checkout-fix\n\n# OR — Snippet mode\n# Just paste the suspicious function\ndef compute_ttc(distance, velocity):\n    if velocity == 0: return float('inf')\n    return distance / velocity`,
    detail: "Something broke. Either grab a unified git diff between your branch and main, OR copy the single function/file you suspect. BranchDebug auto-detects which one you pasted — no flag, no setup.",
    codeLabel: "TERMINAL / EDITOR" },
  { id: 2, label: "Describe the failure in plain English", sublabel: "No structured format required", color: "#4af0c4", Icon: Edit3, zone: "user", track: "both",
    code: `"API throwing 500 on /checkout after deploy.\nCard validation seems broken for Amex cards."`,
    detail: "Paste your code on the left, write what you observed on the right. Stack traces, vague hunches, log lines — all fine. The AI uses your description to weight which lines matter.",
    codeLabel: "FAILURE NOTE" },
  { id: 3, label: "IP Shield sanitizes everything", sublabel: "Server-side, before any external call", color: "#ffcc44", Icon: Lock, zone: "server", track: "both",
    code: `validate_card   →  fn_0042\nAmexValidator   →  fn_0019\ncard_number     →  fn_0003\n\n# comments stripped\n# secrets [REDACTED]`,
    detail: "Before a single byte leaves your server, identifiers are tokenized, comments are stripped, and secret patterns (API keys, JWTs, bearer tokens) are redacted. The token map stays in-memory on your server.",
    codeLabel: "SANITIZER OUTPUT" },
  { id: 4, label: "Anonymized payload sent to AI", sublabel: "Zero-retention gateway", color: "#aa88ff", Icon: Send, zone: "ai", track: "both",
    code: `// Diff track\ndiff --git a/fn_0019.py b/fn_0019.py\n-  if fn_0003 > 15:\n+  if fn_0003 > 16:\n\n// Snippet track\n  12 | def fn_0042(fn_0003):\n  13 |     if len(fn_0003) > 15:`,
    detail: "Whether you sent a diff or a snippet, only the anonymized version reaches the model. Even if intercepted, the payload reveals nothing about your real codebase.",
    codeLabel: "PAYLOAD TO AI" },
  { id: 5, label: "AI ranks suspects by mechanism", sublabel: "Tool-calling for structured output", color: "#aa88ff", Icon: Brain, zone: "ai", track: "both",
    code: `{\n  "summary": "Threshold off-by-one\n     excludes valid 15-digit Amex",\n  "suspects": [{\n    "hunkIndex": 0,\n    "confidence": "high",\n    "mechanism": "..."\n  }]\n}`,
    detail: "The model returns ranked suspects with confidence + cause-and-effect. Diff mode references hunk indexes; snippet mode references line numbers. Both come back as strict JSON.",
    codeLabel: "AI RESPONSE (anonymized)" },
  { id: 6, label: "Token map restores real names", sublabel: "Decrypted server-side", color: "#ffcc44", Icon: Unlock, zone: "server", track: "both",
    code: `fn_0019  →  AmexValidator\nfn_0042  →  validate_card\nfn_0003  →  card_number`,
    detail: "Your server swaps tokens back to real identifiers in the AI response. The model never saw — and still doesn't know — your actual function or file names.",
    codeLabel: "TOKEN RESTORATION" },
  { id: 7, label: "Jump to the suspect line in your editor", sublabel: "vscode:// & cursor:// deep links", color: "#4af0c4", Icon: Target, zone: "user", track: "both",
    code: `HIGH  payments/AmexValidator.py:14\n      validate_card()\n\n→ Click "Jump" to open VS Code\n  at the exact line.`,
    detail: "Each suspect shows real file path + line, confidence, and a one-click deep link that opens VS Code or Cursor at the offending location. Copy the location too — handy for tickets.",
    codeLabel: "RANKED SUSPECTS" },
  { id: 8, label: "Export the report", sublabel: "Markdown for tickets · JSON for tooling", color: "#4af0c4", Icon: Download, zone: "user", track: "both",
    code: `branchdebug-report-2026-05-06.md\nbranchdebug-report-2026-05-06.json\n\n# .md  → paste into Jira / PR description\n# .json → feed to your incident pipeline`,
    detail: "One click exports a self-contained report: verdict, sanitization stats, and every ranked suspect with mechanism + before/after diff. Markdown is review-ready; JSON is automation-ready.",
    codeLabel: "EXPORT" },
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
  const snippetFn = useServerFn(debugSnippet);
  const [language, setLanguage] = useState("auto");
  const detected = detectInputType(diff);

  const runAnalysis = async () => {
    if (!diff.trim() || !failure.trim()) {
      toast.error("Provide both code and a failure description.");
      return;
    }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = detected === "snippet"
        ? await snippetFn({ data: { snippet: diff, failureDescription: failure, language: language === "auto" ? undefined : language } })
        : await debugFn({ data: { diff, failureDescription: failure } });
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
          detected={detected} language={language} setLanguage={setLanguage}
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
                    className="h-7 w-7 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      background: isActive ? s.color : isRevealed ? s.color + "30" : "hsl(var(--muted))",
                      color: isActive ? "#001a0d" : s.color,
                    }}
                  >
                    <s.Icon className="h-3.5 w-3.5" />
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
              <step.Icon className="h-6 w-6" />
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
  detected, language, setLanguage,
}: {
  diff: string; setDiff: (v: string) => void;
  failure: string; setFailure: (v: string) => void;
  result: DebugResult | null; analyzing: boolean;
  onRun: () => void; onSample: () => void;
  editorBase: string; setEditorBase: (v: string) => void;
  detected: "diff" | "snippet" | "unknown";
  language: string; setLanguage: (v: string) => void;
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[480px_1fr] min-h-0 overflow-hidden">
      {/* Input panel */}
      <div className="border-r border-border overflow-y-auto p-6 space-y-4 bg-surface/20">
        <div>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Git diff or code snippet</label>
            <div className="flex items-center gap-2">
              {detected !== "unknown" && (
                <span className={cn(
                  "text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border",
                  detected === "diff" ? "border-purple-400/40 bg-purple-400/10 text-purple-300" : "border-primary/40 bg-primary/10 text-primary"
                )}>
                  {detected === "diff" ? "⎇ git diff" : "{} snippet"}
                </span>
              )}
              <button onClick={onSample} className="text-[10px] font-mono uppercase tracking-widest text-primary hover:underline">Load sample</button>
            </div>
          </div>
          <Textarea
            value={diff}
            onChange={(e) => setDiff(e.target.value)}
            placeholder={"Paste a git diff (git diff main..feature/...) — OR — paste a raw code snippet and we'll analyze it directly."}
            className="font-mono text-xs h-64 resize-none bg-background"
          />
          {detected === "snippet" && (
            <div className="mt-2 flex items-center gap-2">
              <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-[11px] font-mono px-2 py-1 rounded-md bg-background border border-border focus:border-primary outline-none"
              >
                {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </div>
          )}
          {detected === "unknown" ? (
            diff.trim().length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                ⏳ Detecting input type — paste at least a few lines to auto-classify as diff or snippet.
              </p>
            )
          ) : (
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              {detected === "diff"
                ? `⎇ Diff mode · ${diff.split("\n").length} lines · AI will map changed lines to ranked suspects.`
                : `{} Snippet mode · ${diff.split("\n").length} lines · AI will scan this code directly for bugs matching your failure.`}
            </p>
          )}
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
          {analyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="h-4 w-4" /> Analyze {detected === "snippet" ? "snippet" : detected === "diff" ? "diff" : "code"}</>}
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Verdict</div>
                <div className="flex items-center gap-2">
                  <ExportButtons result={result} mode={detected} />
                  <AuditModalTrigger audit={result.audit} stats={result.sanitizationStats} />
                </div>
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

type JiraConfig = {
  baseUrl: string;
  projectKey: string;
  issueType: string;
  assignee: string;
  labels: string;
  components: string;
  descriptionTemplate: string;
};

const JIRA_CONFIG_KEY = "branchdebug.jiraConfig";

const DEFAULT_JIRA_TEMPLATE = `h2. Context
Briefly describe what you were trying to do.

h2. Steps to reproduce
# 
# 

h2. Expected vs actual

{{REPORT}}

h2. Notes
- App: BranchDebug
- Reporter: {{REPORTER}}
- Generated: {{TIMESTAMP}}`;

function loadJiraConfig(): JiraConfig {
  const fallback: JiraConfig = {
    baseUrl: "", projectKey: "", issueType: "Bug", assignee: "",
    labels: "", components: "", descriptionTemplate: DEFAULT_JIRA_TEMPLATE,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(JIRA_CONFIG_KEY);
    if (raw) return { ...fallback, ...JSON.parse(raw) };
  } catch {}
  const oldBase = localStorage.getItem("branchdebug.jiraBaseUrl") || "";
  return { ...fallback, baseUrl: oldBase };
}

const ALLOWED_ISSUE_TYPES = ["Bug", "Task", "Story", "Incident", "Epic", "Sub-task", "Improvement", "New Feature"];

function validateJira(j: JiraConfig): { baseUrl?: string; issueType?: string } {
  const errors: { baseUrl?: string; issueType?: string } = {};
  const raw = j.baseUrl.trim();
  if (!raw) {
    errors.baseUrl = "Base URL is required";
  } else {
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        errors.baseUrl = "Must start with https:// or http://";
      } else if (!u.hostname.includes(".")) {
        errors.baseUrl = "Enter a full hostname (e.g. acme.atlassian.net)";
      } else if (u.search || u.hash || (u.pathname && u.pathname !== "/" && u.pathname !== "")) {
        errors.baseUrl = "Use the base URL only — no path, query, or hash";
      }
    } catch {
      errors.baseUrl = "Not a valid URL";
    }
  }
  const it = j.issueType.trim();
  if (it) {
    if (it.length > 60) {
      errors.issueType = "Issue type is too long";
    } else if (!/^[A-Za-z][A-Za-z0-9 \-]*$/.test(it)) {
      errors.issueType = "Letters, numbers, spaces and hyphens only";
    } else if (!ALLOWED_ISSUE_TYPES.some((t) => t.toLowerCase() === it.toLowerCase())) {
      errors.issueType = `Unknown type. Try: ${ALLOWED_ISSUE_TYPES.slice(0, 4).join(", ")}…`;
    }
  }
  return errors;
}

function ExportButtons({ result, mode }: { result: DebugResult; mode: "diff" | "snippet" | "unknown" }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const [jiraOpen, setJiraOpen] = useState(false);
  const [jira, setJira] = useState<JiraConfig>(() => loadJiraConfig());
  const jiraErrors = validateJira(jira);
  const hasJiraErrors = Object.keys(jiraErrors).length > 0;

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  };

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      mode,
      summary: result.summary,
      suspects: result.suspects,
      sanitizationStats: result.sanitizationStats,
    };
    download(`branchdebug-report-${stamp}.json`, JSON.stringify(payload, null, 2), "application/json");
  };

  const exportMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# BranchDebug Root-Cause Report`);
    lines.push("");
    lines.push(`**Generated:** ${new Date().toLocaleString()}`);
    lines.push(`**Mode:** ${mode === "snippet" ? "Code snippet" : mode === "diff" ? "Git diff" : "Unknown"}`);
    lines.push("");
    lines.push(`## Verdict`);
    lines.push("");
    lines.push(result.summary || "_No summary available._");
    lines.push("");
    lines.push(`## IP Shield Sanitization`);
    lines.push("");
    lines.push(`- ${result.sanitizationStats.identifiersTokenized} identifiers tokenized`);
    lines.push(`- ${result.sanitizationStats.commentsStripped} comment lines stripped`);
    lines.push(`- ${result.sanitizationStats.secretsBlocked} secrets blocked`);
    lines.push("");
    lines.push(`## Ranked Suspects (${result.suspects.length})`);
    lines.push("");
    if (result.suspects.length === 0) {
      lines.push("_No suspect changes identified._");
    } else {
      result.suspects.forEach((s, i) => {
        lines.push(`### #${i + 1} · [${s.confidence.toUpperCase()}] ${s.changeSummary}`);
        lines.push("");
        lines.push(`- **File:** \`${s.filePath}\``);
        lines.push(`- **Lines:** ${s.lineStart}${s.lineEnd !== s.lineStart ? `–${s.lineEnd}` : ""}`);
        if (s.functionName) lines.push(`- **Function:** \`${s.functionName}()\``);
        lines.push("");
        lines.push(`**Mechanism:** ${s.mechanism}`);
        lines.push("");
        if (s.beforeSnippet || s.afterSnippet) {
          lines.push("```diff");
          if (s.beforeSnippet) s.beforeSnippet.split("\n").forEach((l) => lines.push(`- ${l}`));
          if (s.afterSnippet) s.afterSnippet.split("\n").forEach((l) => lines.push(`+ ${l}`));
          lines.push("```");
          lines.push("");
        }
      });
    }
    download(`branchdebug-report-${stamp}.md`, lines.join("\n"), "text/markdown");
  };

  const buildReportSection = () => {
    const body: string[] = [];
    body.push(`*Mode:* ${mode === "snippet" ? "Code snippet" : mode === "diff" ? "Git diff" : "Unknown"}`);
    body.push(`*Generated:* ${new Date().toLocaleString()}`);
    body.push("");
    body.push(`h2. Verdict`);
    body.push(result.summary || "_No summary available._");
    body.push("");
    body.push(`h2. IP Shield Sanitization Stats`);
    body.push(`* ${result.sanitizationStats.identifiersTokenized} identifiers tokenized`);
    body.push(`* ${result.sanitizationStats.commentsStripped} comment lines stripped`);
    body.push(`* ${result.sanitizationStats.secretsBlocked} secrets blocked`);
    body.push("");
    body.push(`h2. Ranked Suspects (${result.suspects.length})`);
    if (result.suspects.length === 0) {
      body.push("_No suspect changes identified._");
    } else {
      result.suspects.forEach((s, i) => {
        body.push(`h3. #${i + 1} [${s.confidence.toUpperCase()}] ${s.changeSummary}`);
        body.push(`* *File:* {{${s.filePath}}}`);
        body.push(`* *Lines:* ${s.lineStart}${s.lineEnd !== s.lineStart ? `-${s.lineEnd}` : ""}`);
        if (s.functionName) body.push(`* *Function:* {{${s.functionName}()}}`);
        body.push(`*Mechanism:* ${s.mechanism}`);
        if (s.beforeSnippet || s.afterSnippet) {
          body.push(`{code}`);
          if (s.beforeSnippet) s.beforeSnippet.split("\n").forEach((l) => body.push(`- ${l}`));
          if (s.afterSnippet) s.afterSnippet.split("\n").forEach((l) => body.push(`+ ${l}`));
          body.push(`{code}`);
        }
        body.push("");
      });
    }
    return body.join("\n");
  };

  const buildJiraDescription = () => {
    const reporter = (typeof window !== "undefined" && (window as any).__bdReporter) || "BranchDebug user";
    const tpl = jira.descriptionTemplate?.includes("{{REPORT}}")
      ? jira.descriptionTemplate
      : `${jira.descriptionTemplate || ""}\n\n{{REPORT}}`;
    return tpl
      .replaceAll("{{REPORT}}", buildReportSection())
      .replaceAll("{{TIMESTAMP}}", new Date().toLocaleString())
      .replaceAll("{{REPORTER}}", reporter)
      .replaceAll("{{MODE}}", mode);
  };

  const buildJiraUrl = () => {
    const base = jira.baseUrl.replace(/\/$/, "");
    const top = result.suspects[0];
    const summary = top
      ? `BranchDebug: ${top.changeSummary} (${top.filePath})`
      : `BranchDebug: ${(result.summary || "Root-cause report").slice(0, 80)}`;
    const params = new URLSearchParams();
    params.set("summary", summary);
    params.set("description", buildJiraDescription());
    if (jira.projectKey.trim()) params.set("pid", jira.projectKey.trim());
    if (jira.issueType.trim()) params.set("issuetype", jira.issueType.trim());
    if (jira.assignee.trim()) params.set("assignee", jira.assignee.trim());
    jira.labels.split(",").map((l) => l.trim()).filter(Boolean).forEach((l) => params.append("labels", l));
    jira.components.split(",").map((c) => c.trim()).filter(Boolean).forEach((c) => params.append("components", c));
    return `${base}/secure/CreateIssue!default.jspa?${params.toString()}`;
  };

  const persistJira = () => {
    const next = { ...jira, baseUrl: jira.baseUrl.replace(/\/$/, "") };
    localStorage.setItem(JIRA_CONFIG_KEY, JSON.stringify(next));
  };

  const createJiraTicket = async () => {
    if (!jira.baseUrl) { toast.error("Jira base URL is required"); return; }
    persistJira();
    // Also download the report files so the user can attach them after Jira opens
    exportMarkdown();
    exportJson();
    try {
      await navigator.clipboard.writeText(buildJiraDescription());
      toast.success("Description copied · .md + .json downloaded — attach in Jira");
    } catch {
      toast.message("Description ready — attach the downloaded .md/.json in Jira");
    }
    window.open(buildJiraUrl(), "_blank", "noopener,noreferrer");
    setJiraOpen(false);
  };

  const copyJiraLink = async () => {
    if (!jira.baseUrl) { toast.error("Jira base URL is required"); return; }
    persistJira();
    try {
      await navigator.clipboard.writeText(buildJiraUrl());
      toast.success("Jira create-issue link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const textFields = [
    { key: "baseUrl", label: "Base URL *", placeholder: "https://acme.atlassian.net" },
    { key: "projectKey", label: "Project key / ID", placeholder: "ENG or 10001" },
    { key: "issueType", label: "Issue type", placeholder: "Bug, Task, Story, Incident" },
    { key: "assignee", label: "Assignee (username / accountId)", placeholder: "jdoe" },
    { key: "labels", label: "Labels (comma-separated)", placeholder: "bug, regression, branch-debug" },
    { key: "components", label: "Components (comma-separated)", placeholder: "API, Auth" },
  ] as const;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={exportMarkdown}
        className="h-7 px-2 rounded-md border border-border bg-background hover:border-primary/40 hover:text-primary text-muted-foreground text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
        title="Export Markdown report"
      >
        <FileText className="h-3 w-3" /> .md
      </button>
      <button
        onClick={exportJson}
        className="h-7 px-2 rounded-md border border-border bg-background hover:border-primary/40 hover:text-primary text-muted-foreground text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
        title="Export JSON report"
      >
        <FileJson className="h-3 w-3" /> .json
      </button>
      <button
        onClick={() => setJiraOpen(true)}
        className="h-7 px-2 rounded-md border border-[#2684ff]/40 bg-[#2684ff]/10 hover:bg-[#2684ff]/20 hover:border-[#2684ff] text-[#2684ff] text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
        title="Create Jira ticket with sanitization stats and ranked suspects"
      >
        <Ticket className="h-3 w-3" /> Jira
      </button>

      {jiraOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setJiraOpen(false)}
        >
          <div
            className="w-full max-w-lg my-8 bg-[#0d1520] border border-border rounded-lg p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-[#2684ff]">
              <Ticket className="h-4 w-4" />
              <h3 className="text-sm font-mono uppercase tracking-widest">Create Jira ticket</h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Optional fields pre-fill the new issue. Saved locally. Use {"{{REPORT}}"}, {"{{TIMESTAMP}}"}, {"{{REPORTER}}"}, {"{{MODE}}"} in the template.
            </p>

            <div className="grid grid-cols-2 gap-2">
              {textFields.map((f) => (
                <label key={f.key} className={f.key === "baseUrl" ? "col-span-2 block" : "block"}>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{f.label}</span>
                  <input
                    type="text"
                    value={jira[f.key]}
                    onChange={(e) => setJira({ ...jira, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="mt-1 w-full h-8 px-2 rounded-md bg-[#080c10] border border-border text-xs font-mono text-foreground focus:border-[#2684ff] outline-none"
                  />
                </label>
              ))}
            </div>

            <label className="block">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Description template</span>
                <button
                  type="button"
                  onClick={() => setJira({ ...jira, descriptionTemplate: DEFAULT_JIRA_TEMPLATE })}
                  className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-[#2684ff]"
                >
                  Reset
                </button>
              </div>
              <textarea
                value={jira.descriptionTemplate}
                onChange={(e) => setJira({ ...jira, descriptionTemplate: e.target.value })}
                rows={6}
                className="mt-1 w-full px-2 py-1.5 rounded-md bg-[#080c10] border border-border text-xs font-mono text-foreground focus:border-[#2684ff] outline-none resize-y"
              />
            </label>

            <div className="rounded-md border border-border bg-[#080c10] p-2 flex items-start gap-2">
              <Paperclip className="h-3 w-3 text-[#2684ff] mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Jira's web URL doesn't support direct file attachments. When you click <strong className="text-foreground">Open in Jira</strong>, the Markdown + JSON reports are auto-downloaded so you can drag-drop them onto the new issue.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
              <button
                onClick={() => setJiraOpen(false)}
                className="h-8 px-3 rounded-md border border-border text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={copyJiraLink}
                className="h-8 px-3 rounded-md border border-[#2684ff]/40 bg-[#2684ff]/10 hover:bg-[#2684ff]/20 text-[#2684ff] text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
                title="Copy the full Jira create-issue URL with all parameters"
              >
                <Link2 className="h-3 w-3" /> Copy link
              </button>
              <button
                onClick={createJiraTicket}
                className="h-8 px-3 rounded-md bg-[#2684ff] hover:bg-[#2684ff]/90 text-white text-[10px] font-mono uppercase tracking-widest flex items-center gap-1"
              >
                <ExternalLink className="h-3 w-3" /> Open in Jira
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
