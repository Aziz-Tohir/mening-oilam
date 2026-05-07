import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const ADMIN_ONLY_PATHS = ["/dashboard/members", "/dashboard/requests", "/dashboard/bot", "/dashboard/settings", "/dashboard/updates"];
const SUPERADMIN_ONLY_PATHS = ["/dashboard/families"];

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const { isAdmin, isSuperadmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [tgAuthing, setTgAuthing] = useState(false);
  const [tgReady, setTgReady] = useState(typeof window !== "undefined" && !!(window as any).Telegram?.WebApp);

  // Lazy-load Telegram WebApp script (only on dashboard, not on landing)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Telegram?.WebApp) { setTgReady(true); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://telegram.org/js/telegram-web-app.js"]');
    if (existing) { existing.addEventListener("load", () => setTgReady(true)); return; }
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.async = true;
    s.onload = () => setTgReady(true);
    document.head.appendChild(s);
  }, []);

  // Telegram Mini App auto-login
  useEffect(() => {
    if (loading || user || tgAuthing || !tgReady) return;
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
  }, [loading, user, tgAuthing, tgReady, navigate]);

  useEffect(() => {
    if (loading || tgAuthing || !tgReady) return;
    if (!user) {
      const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
      if (!tg?.initData) navigate({ to: "/login" });
    }
  }, [loading, user, tgAuthing, tgReady, navigate]);

  // Redirect non-admins away from admin-only pages
  useEffect(() => {
    if (!user || roleLoading) return;
    if (!isSuperadmin && SUPERADMIN_ONLY_PATHS.some(p => location.pathname.startsWith(p))) {
      toast.error("Bu sahifa faqat superadmin uchun");
      navigate({ to: "/dashboard/tree" });
      return;
    }
    if (!isAdmin && ADMIN_ONLY_PATHS.some(p => location.pathname.startsWith(p))) {
      toast.error("Bu sahifa faqat adminlar uchun");
      navigate({ to: "/dashboard/tree" });
    }
  }, [user, roleLoading, isAdmin, isSuperadmin, location.pathname, navigate]);

  if (loading || tgAuthing || !user) return <div className="p-8 text-muted-foreground">Yuklanmoqda…</div>;

  type TabVis = "all" | "admin" | "superadmin";
  const allTabs: Array<[string, string, TabVis]> = [
    ["/dashboard", "Bosh sahifa", "all"],
    ["/dashboard/members", "A'zolar", "admin"],
    ["/dashboard/requests", "So'rovlar", "admin"],
    ["/dashboard/events", "Tadbirlar", "all"],
    ["/dashboard/tree", "Daraxt", "all"],
    ["/dashboard/stats", "Statistika", "all"],
    ["/dashboard/memories", "Xotiralar", "all"],
    ["/dashboard/kinship", "Kim kimga?", "all"],
    ["/dashboard/profile", "Profil", "all"],
    ["/dashboard/bot", "Bot", "admin"],
    ["/dashboard/settings", "Sozlamalar", "admin"],
    ["/dashboard/updates", "Updates", "admin"],
    ["/dashboard/families", "Oilalar", "superadmin"],
  ];
  const tabs = allTabs.filter(([, , vis]) =>
    vis === "all" || (vis === "admin" && isAdmin) || (vis === "superadmin" && isSuperadmin),
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <Link to="/dashboard" className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:text-base">
            🌳 Shajara {!isAdmin && !roleLoading && <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">a'zo</span>}
          </Link>
          <Button size="sm" variant="ghost" onClick={() => { signOut(); navigate({ to: "/" }); }}>Chiqish</Button>
        </div>
        <nav className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-2 pb-2 text-sm sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map(([to, label]) => (
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
