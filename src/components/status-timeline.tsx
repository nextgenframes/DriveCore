import { Check, Loader2, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Stage = "queued" | "analyzing" | "completed" | "failed";

const STAGES: { key: Stage; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "analyzing", label: "Analyzing" },
  { key: "completed", label: "Completed" },
];

function mapStatus(status: string): Stage {
  if (status === "complete" || status === "completed") return "completed";
  if (status === "analyzing" || status === "processing") return "analyzing";
  if (status === "failed") return "failed";
  return "queued";
}

export function StatusTimeline({ status }: { status: string }) {
  const current = mapStatus(status);
  const failed = current === "failed";
  const currentIdx = failed ? 1 : STAGES.findIndex((s) => s.key === current);

  return (
    <div className="rounded-xl border border-border bg-surface/60 p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-3">
        Pipeline status
      </div>
      <div className="flex items-center gap-2">
        {STAGES.map((stage, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx && !failed && current !== "completed";
          const isFailed = failed && i === 1;
          const Icon = isFailed
            ? AlertTriangle
            : done
            ? Check
            : active
            ? Loader2
            : Clock;
          return (
            <div key={stage.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center shrink-0 border",
                  isFailed && "bg-destructive/15 border-destructive text-destructive",
                  done && "bg-severity-low/20 border-severity-low text-severity-low",
                  active && "bg-primary/15 border-primary text-primary",
                  !done && !active && !isFailed && "bg-surface border-border text-muted-foreground"
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", active && "animate-spin")} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "text-xs font-medium truncate",
                    isFailed && "text-destructive",
                    active && "text-foreground",
                    !active && !isFailed && "text-muted-foreground"
                  )}
                >
                  {isFailed ? "Failed" : stage.label}
                </div>
              </div>
              {i < STAGES.length - 1 && (
                <div
                  className={cn(
                    "h-px flex-1 min-w-4",
                    done ? "bg-severity-low/60" : isFailed ? "bg-destructive/40" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
