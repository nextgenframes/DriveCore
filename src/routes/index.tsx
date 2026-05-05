import { createFileRoute, Link } from "@tanstack/react-router";
import { Radar, Cpu, Shield, Activity, BookText, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: "radial-gradient(ellipse at 20% 10%, oklch(0.78 0.14 200 / 0.25), transparent 50%), radial-gradient(ellipse at 80% 60%, oklch(0.32 0.12 280 / 0.3), transparent 50%)" }}/>

      <header className="relative max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)]"><Radar className="h-5 w-5"/></div>
          <span className="font-bold tracking-tight">EventDash</span>
        </div>
        <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign in →</Link>
      </header>

      <section className="relative max-w-5xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface/60 backdrop-blur text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-8">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"/> Multi-agent AV safety analysis
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Turn raw incident logs into <span className="text-primary">actionable safety intelligence</span>.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          EventDash routes every autonomous vehicle event, near miss, and sensor log through four specialized AI agents — surfacing root causes, compliance concerns, and operator coaching plans in seconds.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/auth" className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 shadow-[var(--shadow-glow)]">
            Open the console <ArrowRight className="h-4 w-4"/>
          </Link>
        </div>

        <div className="mt-20 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
          {[
            { icon: Cpu, name: "Event Extraction", desc: "Parses logs, transcripts, and sensor data into a clean event timeline." },
            { icon: Shield, name: "Safety Agent", desc: "Flags violations against NHTSA, ISO 26262, SAE J3016, and FMVSS." },
            { icon: Activity, name: "Risk Agent", desc: "Identifies probable root causes across perception, planning, and control." },
            { icon: BookText, name: "Documentation", desc: "Drafts an export-ready Markdown safety report and coaching plan." },
          ].map((a) => (
            <div key={a.name} className="rounded-xl border border-border bg-surface/60 backdrop-blur p-5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3"><a.icon className="h-4 w-4"/></div>
              <h3 className="font-semibold text-sm">{a.name}</h3>
              <p className="text-xs text-muted-foreground mt-1.5">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
