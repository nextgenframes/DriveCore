import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { GitBranch, Play, RotateCcw, Shield, ChevronLeft, ChevronRight, Check, Loader2, Sparkles, FileCode, ExternalLink, Copy } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { debugBranch, type DebugResult, type Suspect } from "@/server/branch-debug.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

  return (
    <>
      <header className="h-16 border-b border-border flex items-center justify-between px-8 bg-surface/40 backdrop-blur">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">Engineering</div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" /> Branch Debug
          </h1>
        </div>
        <div className="flex gap-2">
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
      </header>

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
  );
}
