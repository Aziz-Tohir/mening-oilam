import { createFileRoute, useNavigate, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) return <div className="p-8 text-muted-foreground">Yuklanmoqda…</div>;

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
