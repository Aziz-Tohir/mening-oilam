import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { listMyFamilies, createFamily, getFamilyStats } from "@/server/families.functions";
import { listEvents, upcomingBirthdays } from "@/server/events.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { isAdmin } = useUserRole();
  const { data: famRes, loading: famLoading, refetch: refetchFams, ts: famTs, stale: famStale } =
    useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const familyIds = families.map((f: any) => f.id).join(",");

  const { data: aggregated, loading: aggLoading, refetch: refetchAgg, ts: aggTs, stale: aggStale } = useCachedServer<{
    stats: Record<string, any>; events: any[]; bdays: any[];
  }>(
    `dashboard:agg:${familyIds}`,
    async () => {
      const stats: Record<string, any> = {};
      const allEvents: any[] = [];
      const allBdays: any[] = [];
      await Promise.all(families.map(async (f: any) => {
        try { stats[f.id] = await callServer(getFamilyStats, { familyId: f.id }); } catch {}
        try {
          const er: any = await callServer(listEvents, { familyId: f.id });
          allEvents.push(...er.events.map((e: any) => ({ ...e, _family: f.name })));
        } catch {}
        try {
          const br: any = await callServer(upcomingBirthdays, { familyId: f.id, days: 60 });
          allBdays.push(...br.items.map((b: any) => ({ ...b, _family: f.name })));
        } catch {}
      }));
      return { stats, events: allEvents, bdays: allBdays };
    },
    undefined,
    { enabled: families.length > 0, staleMs: 1_800_000 },
  );

  const stats = aggregated?.stats ?? {};
  const events = useMemo(() => {
    const now = Date.now();
    return (aggregated?.events ?? [])
      .filter((e: any) => new Date(e.event_at).getTime() >= now - 86400000)
      .sort((a: any, b: any) => +new Date(a.event_at) - +new Date(b.event_at))
      .slice(0, 8);
  }, [aggregated]);
  const bdays = useMemo(() =>
    (aggregated?.bdays ?? []).sort((a: any, b: any) => a.days_until - b.days_until).slice(0, 8),
    [aggregated]);

  const loading = famLoading || (families.length > 0 && aggLoading && !aggregated);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", telegram_group_id: "", my_telegram_id: "", my_full_name: "" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await callServer(createFamily, {
        name: form.name,
        telegram_group_id: form.telegram_group_id ? Number(form.telegram_group_id) : null,
        my_telegram_id: form.my_telegram_id ? Number(form.my_telegram_id) : null,
        my_full_name: form.my_full_name,
      });
      toast.success("Oila yaratildi");
      setOpen(false);
      setForm({ name: "", telegram_group_id: "", my_telegram_id: "", my_full_name: "" });
      invalidateCache("families:");
      invalidateCache("dashboard:");
      refetchFams();
      refetchAgg();
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };


  const handleRefresh = () => {
    invalidateCache("families:");
    invalidateCache("dashboard:");
    refetchFams();
    refetchAgg();
    toast.success("Yangilandi");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bosh sahifa</h1>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={loading}>
          {loading ? "Yangilanmoqda…" : "↻ Yangilash"}
        </Button>
      </div>

      {/* TOP: Upcoming events */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CardTitle>🎉 Yaqin tadbirlar</CardTitle>
            <CacheStatus ts={aggTs} stale={aggStale} loading={aggLoading && !aggregated} onRefresh={() => { invalidateCache("dashboard:"); refetchAgg(); }} />
          </div>
          <Link to="/dashboard/events"><Button size="sm" variant="ghost">Hammasi →</Button></Link>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
            : events.length === 0 ? <p className="text-sm text-muted-foreground">Yaqin tadbirlar yo'q.</p>
            : <ul className="space-y-2">
                {events.map(e => (
                  <li key={e.id} className="flex items-start justify-between gap-3 rounded border border-border bg-muted/30 px-3 py-2">
                    <div>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-xs text-muted-foreground">{new Date(e.event_at).toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" })}{e.location ? ` · ${e.location}` : ""}</div>
                    </div>
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>

      {/* Birthdays */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2"><CardTitle>🎂 Yaqin tug'ilgan kunlar</CardTitle><CacheStatus ts={aggTs} stale={aggStale} loading={aggLoading && !aggregated} onRefresh={() => { invalidateCache("dashboard:"); refetchAgg(); }} /></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
            : bdays.length === 0 ? <p className="text-sm text-muted-foreground">Yaqin tug'ilgan kunlar yo'q.</p>
            : <ul className="space-y-2">
                {bdays.map(b => (
                  <li key={b.id} className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2">
                    <div>
                      <div className="font-medium">{b.full_name}</div>
                      <div className="text-xs text-muted-foreground">{b.next_birthday} · {b.turning_age} yosh</div>
                    </div>
                    <span className="text-xs font-semibold text-primary">{b.days_until === 0 ? "Bugun" : `${b.days_until} kun`}</span>
                  </li>
                ))}
              </ul>}
        </CardContent>
      </Card>

      {/* My families — compact */}
      {families.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2"><CardTitle>👨‍👩‍👧‍👦 Mening oilalarim</CardTitle><CacheStatus ts={famTs} stale={famStale} loading={famLoading && !famRes} /></CardHeader>
          <CardContent className="space-y-2">
            {families.map(f => (
              <div key={f.id} className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">A'zolar: {stats[f.id]?.members ?? "—"} · Aloqalar: {stats[f.id]?.relationships ?? "—"}</div>
                </div>
                {isAdmin && (
                  <Link to="/dashboard/members" search={{ family: f.id } as any}>
                    <Button size="sm" variant="outline">Boshqarish</Button>
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Admin-only: create new family + guide, collapsed */}
      {isAdmin && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>⚙️ Yangi oila va qo'llanma</span>
              <span className="text-xs text-muted-foreground">ochish</span>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4">
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild><Button size="sm">+ Yangi oila</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Yangi oila yaratish</DialogTitle></DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-3">
                    <div><Label>Oila nomi *</Label><Input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Alievlar oilasi" /></div>
                    <div><Label>Sizning to'liq ismingiz *</Label><Input required value={form.my_full_name} onChange={e => setForm({...form, my_full_name: e.target.value})} /></div>
                    <div><Label>Sizning Telegram ID</Label><Input value={form.my_telegram_id} onChange={e => setForm({...form, my_telegram_id: e.target.value})} placeholder="123456789" />
                      <p className="mt-1 text-xs text-muted-foreground">@userinfobot orqali oling</p></div>
                    <div><Label>Telegram guruh ID</Label><Input value={form.telegram_group_id} onChange={e => setForm({...form, telegram_group_id: e.target.value})} placeholder="-100..." />
                      <p className="mt-1 text-xs text-muted-foreground">Botni guruhga qo'shing va guruh ID'ni kiriting</p></div>
                    <Button type="submit" className="w-full">Yaratish</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <Card className="bg-muted/40">
              <CardHeader><CardTitle className="text-base">📋 Qisqa qo'llanma</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>1. <a className="underline" href="https://t.me/BotFather" target="_blank">BotFather</a>'da bot yarating va botni o'z guruhingizga <b>admin</b> qilib qo'shing.</p>
                <p>2. <a className="underline" href="https://t.me/userinfobot" target="_blank">@userinfobot</a> orqali o'z Telegram ID'ngizni va guruh ID'ni oling.</p>
                <p>3. Yuqoridagi tugma orqali oila yarating.</p>
                <p>4. Telegram webhook avtomatik ulangan.</p>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
