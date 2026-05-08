import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Radar, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Map username -> synthetic email for Supabase (which requires email auth)
  const USERNAME_DOMAIN = "drivecore.local";
  const toEmail = (u: string) => `${u.trim().toLowerCase()}@${USERNAME_DOMAIN}`;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[var(--gradient-brand)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 30% 30%, oklch(0.78 0.14 200 / 0.4), transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Radar className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">DriveCore</span>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <ShieldAlert className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold leading-tight">
            Multi-agent safety analysis for autonomous fleets.
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload incident reports, telemetry transcripts, or sensor logs. DriveCore extracts events, identifies root causes, flags compliance risks, and drafts coaching plans — in seconds.
          </p>
          <div className="flex gap-2 pt-4 font-mono text-xs text-muted-foreground">
            <span className="px-2 py-1 rounded bg-surface border border-border">EVENT</span>
            <span className="px-2 py-1 rounded bg-surface border border-border">SAFETY</span>
            <span className="px-2 py-1 rounded bg-surface border border-border">RISK</span>
            <span className="px-2 py-1 rounded bg-surface border border-border">DOC</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12">
        <form onSubmit={submit} className="w-full max-w-md space-y-6">
          <div>
            <h2 className="text-3xl font-bold">{mode === "login" ? "Sign in" : "Create account"}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login" ? "Welcome back, operator." : "Get access to the safety console."}
            </p>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jordan Reyes" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ops@fleet.io" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
            {loading ? "…" : mode === "login" ? "Sign in" : "Create account"}
          </Button>

          <p className="text-sm text-muted-foreground text-center">
            {mode === "login" ? "No account?" : "Have an account?"}{" "}
            <button type="button" className="text-primary font-medium hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "Sign up" : "Sign in"}
            </button>
          </p>
          <p className="text-xs text-center text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Back home</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
