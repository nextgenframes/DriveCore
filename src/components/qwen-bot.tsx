import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Bot, Sparkles, X, Brain, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type QwenBotProps = {
  status: "idle" | "analyzing" | "complete" | "failed";
  summary?: string | null;
  severity?: string;
  error?: string | null;
  incidentId?: string | null;
};

type Learning = {
  id: string;
  category: "correction" | "insight" | "error" | "best_practice";
  content: string;
  context: string | null;
  created_at: string;
};

type Tab = "chat" | "learnings";

const CATEGORIES: Learning["category"][] = ["correction", "insight", "error", "best_practice"];

export function QwenBot({ status, summary, severity, error, incidentId }: QwenBotProps) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<Tab>("chat");
  const [typed, setTyped] = useState("");
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState<Learning["category"]>("correction");
  const [newContent, setNewContent] = useState("");

  const message =
    status === "analyzing"
      ? "Reasoning through the incident… engaging Event, Safety, Risk and Documentation agents."
      : status === "failed"
      ? `I hit a snag: ${error ?? "unknown error"}.`
      : summary ?? "Hi, I'm Qwen — submit or select an incident and I'll analyze it for you. Teach me in the Learnings tab.";

  useEffect(() => {
    setTyped("");
    if (!open || tab !== "chat") return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(message.slice(0, i));
      if (i >= message.length) clearInterval(id);
    }, 14);
    return () => clearInterval(id);
  }, [message, open, tab]);

  const loadLearnings = useCallback(async () => {
    const { data } = await supabase
      .from("qwen_learnings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setLearnings((data ?? []) as Learning[]);
  }, []);

  useEffect(() => {
    if (open && tab === "learnings") loadLearnings();
  }, [open, tab, loadLearnings]);

  const addLearning = async () => {
    if (!newContent.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      toast.error("Sign in first.");
      return;
    }
    const { error: e } = await supabase.from("qwen_learnings").insert({
      user_id: u.user.id,
      incident_id: incidentId ?? null,
      category: newCategory,
      content: newContent.trim(),
    });
    if (e) {
      toast.error(e.message);
      return;
    }
    toast.success("Qwen learned something new.");
    setNewContent("");
    setAdding(false);
    loadLearnings();
  };

  const removeLearning = async (id: string) => {
    await supabase.from("qwen_learnings").delete().eq("id", id);
    loadLearnings();
  };

  const moodColor =
    status === "failed" ? "text-severity-critical"
    : status === "analyzing" ? "text-primary"
    : severity === "critical" || severity === "high" ? "text-severity-high"
    : "text-primary";

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-end gap-3 pointer-events-none">
      {open && (
        <div className="pointer-events-auto w-80 rounded-2xl rounded-br-sm border border-border bg-surface-elevated/95 backdrop-blur shadow-[var(--shadow-glow)] animate-in fade-in slide-in-from-bottom-2 overflow-hidden flex flex-col max-h-[70vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-border">
            <div className="flex items-center gap-1.5">
              <Sparkles className={cn("h-3 w-3", moodColor)} />
              <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
                Qwen · {status}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
              <X className="h-3 w-3" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border text-[10px] font-mono uppercase tracking-wider">
            <TabButton active={tab === "chat"} onClick={() => setTab("chat")}>Analysis</TabButton>
            <TabButton active={tab === "learnings"} onClick={() => setTab("learnings")}>
              <Brain className="h-3 w-3 inline mr-1" />Learnings ({learnings.length || "·"})
            </TabButton>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {tab === "chat" ? (
              <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                {typed}
                {typed.length < message.length && (
                  <span className="inline-block w-1 h-3 bg-primary ml-0.5 animate-pulse" />
                )}
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Teach Qwen. Recent learnings are injected into every analysis.
                </p>
                {learnings.length === 0 && !adding && (
                  <p className="text-[11px] text-muted-foreground italic">No learnings yet.</p>
                )}
                {learnings.map((l) => (
                  <div key={l.id} className="rounded-md border border-border bg-surface p-2 group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-primary">{l.category}</span>
                      <button onClick={() => removeLearning(l.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="text-[11px] text-foreground/85">{l.content}</p>
                  </div>
                ))}

                {adding ? (
                  <div className="rounded-md border border-primary/40 bg-surface p-2 space-y-2">
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as Learning["category"])}
                      className="w-full text-[11px] bg-background border border-border rounded px-2 py-1"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      placeholder="What should Qwen remember?"
                      rows={3}
                      className="w-full text-[11px] bg-background border border-border rounded px-2 py-1 resize-none"
                    />
                    <div className="flex gap-1">
                      <button onClick={addLearning} className="flex-1 text-[10px] uppercase tracking-wider font-mono bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90">Save</button>
                      <button onClick={() => { setAdding(false); setNewContent(""); }} className="text-[10px] uppercase tracking-wider font-mono border border-border rounded px-2 py-1 hover:bg-surface">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} className="w-full flex items-center justify-center gap-1 text-[10px] uppercase tracking-wider font-mono border border-dashed border-border rounded px-2 py-2 text-muted-foreground hover:text-primary hover:border-primary/40">
                    <Plus className="h-3 w-3" /> Teach Qwen
                  </button>
                )}
              </div>
            )}
          </div>
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
        {status === "analyzing" && (
          <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-60" />
        )}
        <div className="relative">
          <Bot className={cn("h-8 w-8", moodColor)} />
          <span className="absolute -top-0.5 left-1.5 h-1 w-1 rounded-full bg-primary animate-pulse" />
          <span className="absolute -top-0.5 right-1.5 h-1 w-1 rounded-full bg-primary animate-pulse" />
        </div>
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

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 transition-colors",
        active ? "text-primary border-b-2 border-primary -mb-px" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
