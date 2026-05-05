import { createFileRoute, useNavigate, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [tgAuthing, setTgAuthing] = useState(false);

  // Telegram Mini App auto-login
  useEffect(() => {
    if (loading || user || tgAuthing) return;
    const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
    const initData = tg?.initData;
    if (!initData) return;
    setTgAuthing(true);
    tg.ready?.();
    tg.expand?.();
    (async () => {
      try {
        const res = await fetch("/api/public/telegram/miniapp-auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.message ?? json?.error ?? "Login xatosi");
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink",
          token_hash: json.token_hash,
        });
        if (error) throw error;
      } catch (e: any) {
        toast.error(e?.message ?? "Telegram orqali kirish amalga oshmadi");
        navigate({ to: "/login" });
      } finally {
        setTgAuthing(false);
      }
    })();
  }, [loading, user, tgAuthing, navigate]);

  useEffect(() => {
    if (loading || tgAuthing) return;
    if (!user) {
      const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
      if (!tg?.initData) navigate({ to: "/login" });
    }
  }, [loading, user, tgAuthing, navigate]);

  if (loading || tgAuthing || !user) return <div className="p-8 text-muted-foreground">Yuklanmoqda…</div>;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:text-base">🌳 Shajara</Link>
          <Button size="sm" variant="ghost" onClick={() => { signOut(); navigate({ to: "/" }); }}>Chiqish</Button>
        </div>
        <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 pb-2 text-sm sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[
            ["/dashboard", "Bosh sahifa"],
            ["/dashboard/members", "A'zolar"],
            ["/dashboard/requests", "So'rovlar"],
            ["/dashboard/events", "Tadbirlar"],
            ["/dashboard/tree", "Daraxt"],
            ["/dashboard/kinship", "Kim kimga?"],
            ["/dashboard/bot", "Bot"],
            ["/dashboard/settings", "Sozlamalar"],
          ].map(([to, label]) => (
            <Link key={to} to={to} className="shrink-0 whitespace-nowrap rounded px-2.5 py-1.5 hover:bg-muted [&.active]:bg-muted [&.active]:font-semibold" activeProps={{ className: "active" }}>{label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
