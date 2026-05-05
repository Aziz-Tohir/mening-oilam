import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listMyFamilies, createFamily, getFamilyStats } from "@/server/families.functions";
import { callServer } from "@/lib/serverCall";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, any>>({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", telegram_group_id: "", my_telegram_id: "", my_full_name: "" });

  const load = async () => {
    setLoading(true);
    try {
      const res = await callServer(listMyFamilies);
      setFamilies(res.families);
      const all: Record<string, any> = {};
      for (const f of res.families) {
        try { all[f.id] = await callServer(getFamilyStats, { familyId: f.id }); } catch {}
      }
      setStats(all);
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
      load();
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Mening oilalarim</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="w-full sm:w-auto">+ Yangi oila</Button></DialogTrigger>
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

      {loading ? <p className="mt-8 text-muted-foreground">Yuklanmoqda…</p> : families.length === 0 ? (
        <Card className="mt-8"><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">Hali oila yo'q. Birinchi oilangizni yarating.</p>
        </CardContent></Card>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {families.map(f => (
            <Card key={f.id}>
              <CardHeader><CardTitle>{f.name}</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <Stat label="A'zolar" value={stats[f.id]?.members ?? "—"} />
                  <Stat label="So'rovlar" value={stats[f.id]?.pendingRequests ?? "—"} />
                  <Stat label="Aloqalar" value={stats[f.id]?.relationships ?? "—"} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Guruh ID: {f.telegram_group_id ?? "—"}</p>
                <Link to="/dashboard/members" search={{ family: f.id } as any}>
                  <Button size="sm" variant="outline" className="mt-3 w-full">Boshqarish</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8 bg-muted/40">
        <CardHeader><CardTitle>📋 Qisqa qo'llanma</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>1. <a className="underline" href="https://t.me/BotFather" target="_blank">BotFather</a>'da bot yarating va botni o'z guruhingizga <b>admin</b> qilib qo'shing.</p>
          <p>2. <a className="underline" href="https://t.me/userinfobot" target="_blank">@userinfobot</a> orqali o'z Telegram ID'ngizni va guruh ID'ni oling.</p>
          <p>3. Yuqoridagi tugma orqali oila yarating.</p>
          <p>4. Telegram webhook avtomatik ulangan — botga yozilgan har bir xabar darhol qayta ishlanadi.</p>
          <p>5. <b>Tug'ilgan kun va tadbir eslatmalari</b> uchun har kuni ertalab (masalan, 08:00) <a className="underline" href="https://cron-job.org" target="_blank" rel="noreferrer">cron-job.org</a>'da quyidagi URL'ni chaqiring:<br/><code className="break-all text-xs">https://project--858ca73f-22bf-4369-b9d0-1671ce37994d.lovable.app/api/public/cron/daily-reminders?secret=YOUR_CRON_SECRET</code></p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md bg-muted/50 p-2 text-center">
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
