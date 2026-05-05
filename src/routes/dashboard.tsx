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
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold">🌳 Shajara</Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/dashboard" className="rounded px-3 py-1.5 hover:bg-muted">Bosh sahifa</Link>
            <Link to="/dashboard/members" className="rounded px-3 py-1.5 hover:bg-muted">A'zolar</Link>
            <Link to="/dashboard/requests" className="rounded px-3 py-1.5 hover:bg-muted">So'rovlar</Link>
            <Link to="/dashboard/events" className="rounded px-3 py-1.5 hover:bg-muted">Tadbirlar</Link>
            <Link to="/dashboard/tree" className="rounded px-3 py-1.5 hover:bg-muted">Daraxt</Link>
            <Link to="/dashboard/kinship" className="rounded px-3 py-1.5 hover:bg-muted">Kim kimga?</Link>
            <Link to="/dashboard/settings" className="rounded px-3 py-1.5 hover:bg-muted">Sozlamalar</Link>
            <Button size="sm" variant="ghost" onClick={() => { signOut(); navigate({ to: "/" }); }}>Chiqish</Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
