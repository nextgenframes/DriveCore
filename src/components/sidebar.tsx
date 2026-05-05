import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Radar, AlertTriangle, FileBarChart, GraduationCap, Scale, LogOut, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

const nav = [
  { to: "/dashboard", label: "Incidents", icon: AlertTriangle },
  { to: "/dashboard/reports", label: "Reports", icon: FileBarChart },
  { to: "/dashboard/coaching", label: "Coaching", icon: GraduationCap },
  { to: "/dashboard/compliance", label: "Compliance", icon: Scale },
] as const;

export function Sidebar({ user }: { user: User | null }) {
  const loc = useLocation();
  const navigate = useNavigate();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-[var(--shadow-glow)]">
            <Radar className="h-5 w-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none">AVISYS</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">Safety Console</div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to || (to !== "/dashboard" && loc.pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
            <UserIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{user?.email ?? "—"}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Operator</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
