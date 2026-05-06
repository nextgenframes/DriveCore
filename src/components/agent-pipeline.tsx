import { useEffect, useState } from "react";
import { Cpu, Shield, Activity, BookText, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const AGENTS = [
  { key: "event", label: "Event Extraction", icon: Cpu, task: "Parsing timeline & sensor events…" },
  { key: "safety", label: "Safety", icon: Shield, task: "Cross-checking NHTSA / ISO 26262…" },
  { key: "risk", label: "Risk", icon: Activity, task: "Inferring probable root causes…" },
  { key: "docs", label: "Documentation", icon: BookText, task: "Drafting safety report…" },
] as const;

const STEP_MS = 1400;

export function AgentPipeline() {
  const [active, setActive] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setActive((a) => (a + 1) % AGENTS.length);
    }, STEP_MS);
    return () => clearInterval(id);
  }, []);

  // Smooth progress within current step
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const id = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / STEP_MS) * 100);
      setProgress(p);
      if (p >= 100) clearInterval(id);
    }, 40);
    return () => clearInterval(id);
  }, [tick]);

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4 overflow-hidden relative">
      {/* Scanline */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-60 animate-[scanline_2.4s_linear_infinite]" />

      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="font-medium text-sm">Multi-agent analysis in progress</p>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          {String(active + 1).padStart(2, "0")} / {String(AGENTS.length).padStart(2, "0")}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {AGENTS.map((agent, i) => {
          const Icon = agent.icon;
          const state = i < active ? "done" : i === active ? "active" : "pending";
          return (
            <div
              key={agent.key}
              className={cn(
                "rounded-lg border p-3 transition-colors duration-300",
                state === "done" && "border-severity-low/40 bg-severity-low/5",
                state === "active" && "border-primary/60 bg-primary/10 shadow-[0_0_20px_-8px_hsl(var(--primary))]",
                state === "pending" && "border-border bg-surface/40 opacity-60"
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "h-7 w-7 rounded-md flex items-center justify-center shrink-0 transition-colors",
                    state === "done" && "bg-severity-low/20 text-severity-low",
                    state === "active" && "bg-primary/20 text-primary",
                    state === "pending" && "bg-muted/30 text-muted-foreground"
                  )}
                >
                  {state === "done" ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : state === "active" ? (
                    <Icon className="h-3.5 w-3.5 animate-pulse" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                    Agent {i + 1}
                  </div>
                  <div className="text-xs font-medium truncate">{agent.label}</div>
                </div>
              </div>
              <div className="mt-2 h-1 w-full rounded-full bg-background/60 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    state === "done" && "w-full bg-severity-low",
                    state === "active" && "bg-primary",
                    state === "pending" && "w-0 bg-primary"
                  )}
                  style={state === "active" ? { width: `${progress}%` } : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="truncate">{AGENTS[active].task}</span>
      </div>

      <style>{`
        @keyframes scanline {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
