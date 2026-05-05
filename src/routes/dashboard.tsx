import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar } from "@/components/sidebar";
import type { User } from "@supabase/supabase-js";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={user} />
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
