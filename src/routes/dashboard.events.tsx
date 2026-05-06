import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/server/families.functions";
import { listEvents, createEvent, deleteEvent, upcomingBirthdays } from "@/server/events.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/events")({
  component: EventsPage,
});

function EventsPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data: evRes, refetch: refetchEvents, ts: evTs, stale: evStale, loading: evLoading } = useCachedServer<{ events: any[] }>(
    `events:${familyId}`, listEvents, { familyId }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const { data: bdRes, ts: bdTs, stale: bdStale, loading: bdLoading } = useCachedServer<{ items: any[] }>(
    `bdays:${familyId}`, upcomingBirthdays, { familyId, days: 60 }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const events = evRes?.events ?? [];
  const bdays = bdRes?.items ?? [];

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", eventAt: "", location: "",
    isRecurringYearly: false, notifyGroup: true,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await callServer(createEvent, {
        familyId,
        title: form.title,
        description: form.description || null,
        eventAt: new Date(form.eventAt).toISOString(),
        location: form.location || null,
        isRecurringYearly: form.isRecurringYearly,
        notifyDaysBefore: [7, 1, 0],
        notifyGroup: form.notifyGroup,
      });
      toast.success("Tadbir qo'shildi");
      setOpen(false);
      setForm({ title: "", description: "", eventAt: "", location: "", isRecurringYearly: false, notifyGroup: true });
      invalidateCache(`events:${familyId}`);
      invalidateCache("dashboard:");
      refetchEvents();
    } catch (err: any) { toast.error(err.message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Tadbirni o'chirasizmi?")) return;
    try {
      await callServer(deleteEvent, { familyId, id });
      toast.success("O'chirildi");
      invalidateCache(`events:${familyId}`);
      invalidateCache("dashboard:");
      refetchEvents();
    } catch (e: any) { toast.error(e?.message ?? "O'chirib bo'lmadi"); }
  };


  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Tadbirlar va tug'ilgan kunlar</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={familyId} onValueChange={setFamilyId}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Oila" /></SelectTrigger>
            <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button disabled={!familyId} className="w-full sm:w-auto">+ Yangi tadbir</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Yangi tadbir</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <div><Label>Sarlavha *</Label><Input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Nikoh to'yi" /></div>
                <div><Label>Sana va vaqt *</Label><Input type="datetime-local" required value={form.eventAt} onChange={e => setForm({...form, eventAt: e.target.value})} /></div>
                <div><Label>Joy</Label><Input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Toshkent, ..." /></div>
                <div><Label>Tavsif</Label><Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
                <div className="flex items-center justify-between"><Label>Har yili takrorlanadi</Label>
                  <Switch checked={form.isRecurringYearly} onCheckedChange={v => setForm({...form, isRecurringYearly: v})} />
                </div>
                <div className="flex items-center justify-between"><Label>Guruhga ham yuborish</Label>
                  <Switch checked={form.notifyGroup} onCheckedChange={v => setForm({...form, notifyGroup: v})} />
                </div>
                <p className="text-xs text-muted-foreground">Eslatmalar 7 kun, 1 kun va aynan o'sha kun yuboriladi.</p>
                <Button type="submit" className="w-full">Saqlash</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2"><CardTitle>🎂 Yaqin tug'ilgan kunlar (60 kun)</CardTitle><CacheStatus ts={bdTs} stale={bdStale} loading={bdLoading && !bdRes} /></CardHeader>
        <CardContent>
          {bdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">A'zolarning tug'ilgan sanasini kiriting (A'zolar bo'limida).</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {bdays.map((b: any) => (
                <div key={b.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div>
                    <div className="font-medium">{b.full_name}</div>
                    <div className="text-xs text-muted-foreground">{b.next_birthday} • {b.turning_age} yosh</div>
                  </div>
                  <Badge variant={b.days_until === 0 ? "default" : "secondary"}>
                    {b.days_until === 0 ? "Bugun!" : `${b.days_until} kun`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2"><CardTitle>📅 Tadbirlar</CardTitle><CacheStatus ts={evTs} stale={evStale} loading={evLoading && !evRes} /></CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hali tadbir yo'q.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e: any) => (
                <div key={e.id} className="flex items-start justify-between rounded-md border border-border p-3">
                  <div>
                    <div className="font-medium">{e.title} {e.is_recurring_yearly && <Badge variant="outline" className="ml-2">Har yili</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(e.event_at), "dd MMM yyyy, HH:mm")}{e.location ? ` • ${e.location}` : ""}</div>
                    {e.description && <p className="mt-1 text-sm">{e.description}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(e.id)}>O'chirish</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
