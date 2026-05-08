import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Bot, Sparkles, X } from "lucide-react";

type QwenBotProps = {
  status: "idle" | "analyzing" | "complete" | "failed";
  summary?: string | null;
  severity?: string;
  error?: string | null;
};

/**
 * Floating Qwen mascot — an animated robot that "speaks" the latest analysis.
 * Sits in the bottom-right corner of the dashboard.
 */
export function QwenBot({ status, summary, severity, error }: QwenBotProps) {
  const [open, setOpen] = useState(true);
  const [typed, setTyped] = useState("");

  const message =
    status === "analyzing"
      ? "Reasoning through the incident… engaging Event, Safety, Risk and Documentation agents."
      : status === "failed"
      ? `I hit a snag: ${error ?? "unknown error"}.`
      : summary ?? "Hi, I'm Qwen — submit or select an incident and I'll analyze it for you.";

  // Typewriter effect
  useEffect(() => {
    setTyped("");
    if (!open) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(message.slice(0, i));
      if (i >= message.length) clearInterval(id);
    }, 14);
    return () => clearInterval(id);
  }, [message, open]);

  const moodColor =
    status === "failed"
      ? "text-severity-critical"
      : status === "analyzing"
      ? "text-primary"
      : severity === "critical" || severity === "high"
      ? "text-severity-high"
      : "text-primary";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3 pointer-events-none">
      {/* Speech bubble */}
      {open && (
        <div className="pointer-events-auto max-w-xs rounded-2xl rounded-br-sm border border-border bg-surface-elevated/95 backdrop-blur p-4 shadow-[var(--shadow-glow)] animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className={cn("h-3 w-3", moodColor)} />
              <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                Qwen · {status}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {typed}
            {typed.length < message.length && <span className="inline-block w-1 h-3 bg-primary ml-0.5 animate-pulse" />}
          </p>
        </div>
      )}

      {/* Bot avatar */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "pointer-events-auto relative h-16 w-16 rounded-full border-2 flex items-center justify-center transition-all hover:scale-105",
          "bg-gradient-to-br from-surface-elevated to-surface",
          status === "analyzing"
            ? "border-primary shadow-[0_0_30px_hsl(var(--primary)/0.5)]"
            : status === "failed"
            ? "border-severity-critical"
            : "border-primary/40 shadow-[var(--shadow-glow)]"
        )}
        aria-label="Toggle Qwen bot"
      >
        {/* Pulse ring while analyzing */}
        {status === "analyzing" && (
          <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-60" />
        )}
        {/* Robot face */}
        <div className="relative">
          <Bot className={cn("h-8 w-8", moodColor)} />
          {/* eyes blink */}
          <span className="absolute -top-0.5 left-1.5 h-1 w-1 rounded-full bg-primary animate-pulse" />
          <span className="absolute -top-0.5 right-1.5 h-1 w-1 rounded-full bg-primary animate-pulse" />
        </div>
        {/* Status dot */}
        <span
          className={cn(
            "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background",
            status === "complete" && "bg-severity-low",
            status === "analyzing" && "bg-primary animate-pulse",
            status === "failed" && "bg-severity-critical",
            status === "idle" && "bg-muted-foreground"
          )}
        />
      </button>
    </div>
  );
}
