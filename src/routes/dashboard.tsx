import { createFileRoute, useNavigate, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { clearTokens, isAuthenticated, miniAppAuth, miniAppRegister } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const ADMIN_ONLY_PATHS = ["/dashboard/members", "/dashboard/requests", "/dashboard/bot", "/dashboard/settings", "/dashboard/updates", "/dashboard/logs"];
const SUPERADMIN_ONLY_PATHS = ["/dashboard/families"];

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const { isAdmin, isSuperadmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const location = useLocation();
  const [tgAuthing, setTgAuthing] = useState(false);
  const [tgReady, setTgReady] = useState(typeof window !== "undefined" && !!(window as any).Telegram?.WebApp);
  const [tgError, setTgError] = useState<{ kind: "not_registered" | "pending" | "other"; message: string } | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [inviting, setInviting] = useState(false);

  // Lazy-load Telegram WebApp script
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

  // Reset flow: ?reset=1 or Telegram start_param=reset
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const hasReset = url.searchParams.get("reset") === "1";
    const tg = (window as any).Telegram?.WebApp;
    if (!hasReset && tg?.initDataUnsafe?.start_param !== "reset") return;
    clearTokens();
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    url.searchParams.delete("reset");
    window.location.replace(url.pathname + (url.search || "") + url.hash);
  }, []);

  // Account switch detection inside Telegram Mini App
  useEffect(() => {
    if (loading || !tgReady || tgAuthing || !user) return;
    const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
    const initData: string | undefined = tg?.initData;
    if (!initData) return;
    try {
      const params = new URLSearchParams(initData);
      const tgUser = params.get("user") ? JSON.parse(params.get("user")!) : null;
      const tgId = tgUser?.id ? Number(tgUser.id) : null;
      if (!tgId || !user.telegram_id) return;
      if (Number(user.telegram_id) !== tgId) {
        // Different Telegram user — clear session and re-authenticate
        clearTokens();
        try { localStorage.clear(); } catch {}
        try { sessionStorage.clear(); } catch {}
        window.location.reload();
      }
    } catch {}
  }, [loading, user, tgReady, tgAuthing]);

  // Telegram Mini App auto-login
  useEffect(() => {
    if (loading || user || tgAuthing || !tgReady || tgError) return;
    const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
    const initData = tg?.initData;
    if (!initData) return;
    setTgAuthing(true);
    tg.ready?.();
    tg.expand?.();
    (async () => {
      try {
        await miniAppAuth(initData);
        // onAuthChange in useAuth will reload the user automatically
      } catch (err: any) {
        const msg: string = err?.message ?? "";
        if (msg.includes("not_registered")) {
          setTgError({ kind: "not_registered", message: "Siz hech qaysi oilada a'zo emassiz." });
        } else if (msg.includes("pending")) {
          setTgError({ kind: "pending", message: "So'rov admin tasdig'ini kutmoqda." });
        } else {
          setTgError({ kind: "other", message: msg || "Telegram orqali kirish amalga oshmadi" });
        }
      } finally {
        setTgAuthing(false);
      }
    })();
  }, [loading, user, tgAuthing, tgReady, tgError]);

  useEffect(() => {
    if (loading || tgAuthing || !tgReady) return;
    if (!user && !tgError && !isAuthenticated()) {
      const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
      if (!tg?.initData) navigate({ to: "/login" });
    }
  }, [loading, user, tgAuthing, tgReady, tgError, navigate]);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    setInviting(true);
    try {
      const tg = (typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null);
      await miniAppRegister(tg?.initData ?? "", code);
      toast.success("So'rov yuborildi! Admin tasdiqlashidan keyin qayta kirib ko'ring.");
      setTgError({ kind: "pending", message: "So'rovingiz adminga yuborildi. Tasdiqlangach mini-app'ga kira olasiz." });
    } catch (err: any) {
      toast.error(err?.message ?? "Xato");
    } finally {
      setInviting(false);
    }
  };

  // Redirect non-admins away from restricted pages
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

  if (tgError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
        <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 space-y-4">
          <h2 className="text-lg font-semibold">
            {tgError.kind === "pending" ? "⏳ Tasdiq kutilmoqda" : "🔐 Oilaga qo'shilish"}
          </h2>
          <p className="text-sm text-muted-foreground">{tgError.message}</p>
          {tgError.kind === "not_registered" && (
            <form onSubmit={submitInvite} className="space-y-2">
              <label className="text-sm font-medium">Taklif kodi (8 belgi)</label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={8}
                placeholder="ABCD1234"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm uppercase tracking-widest"
              />
              <p className="text-xs text-muted-foreground">Adminingizdan yoki guruhda <code>/invite</code> orqali oling.</p>
              <Button type="submit" className="w-full" disabled={inviting || inviteCode.trim().length < 4}>
                {inviting ? "Yuborilmoqda…" : "So'rov yuborish"}
              </Button>
            </form>
          )}
          <Button variant="outline" className="w-full" onClick={() => { setTgError(null); window.location.reload(); }}>
            Qayta urinish
          </Button>
        </div>
      </div>
    );
  }

  if (loading || tgAuthing || !user) return <div className="p-8 text-muted-foreground">Yuklanmoqda…</div>;

  type TabVis = "all" | "admin" | "superadmin";
  const allTabs: Array<[string, string, TabVis]> = [
    ["/dashboard", "Bosh sahifa", "all"],
    ["/dashboard/members", "A'zolar", "admin"],
    ["/dashboard/requests", "So'rovlar", "admin"],
    ["/dashboard/events", "Tadbirlar", "all"],
    ["/dashboard/tree", "Daraxt", "all"],
    ["/dashboard/stats", "Statistika", "all"],
    ["/dashboard/sentiment", "Ruhiy holat", "all"],
    ["/dashboard/memories", "Xotiralar", "all"],
    ["/dashboard/kinship", "Kim kimga?", "all"],
    ["/dashboard/profile", "Profil", "all"],
    ["/dashboard/bot", "Bot", "admin"],
    ["/dashboard/settings", "Sozlamalar", "admin"],
    ["/dashboard/updates", "Updates", "admin"],
    ["/dashboard/logs", "Loglar", "admin"],
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
