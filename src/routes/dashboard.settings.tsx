import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyFamilies } from "@/server/families.functions";
import { getSettings, updateSettings } from "@/server/admin.functions";
import { callServer } from "@/lib/serverCall";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [families, setFamilies] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState<string>("");
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    callServer(listMyFamilies)
      .then(r => { setFamilies(r.families); if (r.families[0]) setFamilyId(r.families[0].id); })
      .catch((e: any) => toast.error(e?.message ?? "Oilalarni yuklab bo'lmadi"));
  }, []);
  useEffect(() => {
    if (familyId) callServer(getSettings, { familyId })
      .then(r => setSettings(r.settings))
      .catch((e: any) => toast.error(e?.message ?? "Sozlamalarni yuklab bo'lmadi"));
  }, [familyId]);

  const save = async (patch: any) => {
    setSettings({ ...settings, ...patch });
    try { await callServer(updateSettings, { familyId, patch }); toast.success("Saqlandi"); }
    catch (e: any) { toast.error(e?.message ?? "Saqlab bo'lmadi"); }
  };

  if (!settings) return <p className="text-muted-foreground">Yuklanmoqda…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sozlamalar</h1>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Moderatsiya</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Kirdi-chiqdi xabarlarini o'chirish">
              <Switch checked={!!settings.delete_join_leave_messages} onCheckedChange={(v) => save({ delete_join_leave_messages: v })} />
            </Row>
            <Row label="Yumshoq moderatsiya (DM ogohlantirish)">
              <Switch checked={!!settings.soft_moderation_enabled} onCheckedChange={(v) => save({ soft_moderation_enabled: v })} />
            </Row>
            <Row label="Xush kelibsiz xabari auto-delete (sek)">
              <Input type="number" className="w-24" value={settings.welcome_message_auto_delete_seconds ?? 0}
                onBlur={(e) => save({ welcome_message_auto_delete_seconds: Number(e.target.value) })}
                onChange={(e) => setSettings({ ...settings, welcome_message_auto_delete_seconds: Number(e.target.value) })} />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Onboarding</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Admin javobsiz so'rovni avto-tasdiqlash (soat, 0=o'chirilgan)">
              <Input type="number" className="w-24" value={settings.join_request_auto_approve_timeout_hours ?? 0}
                onBlur={(e) => save({ join_request_auto_approve_timeout_hours: Number(e.target.value) })}
                onChange={(e) => setSettings({ ...settings, join_request_auto_approve_timeout_hours: Number(e.target.value) })} />
            </Row>
            <Row label="Admin javobsiz so'rovni avto-rad etish (soat)">
              <Input type="number" className="w-24" value={settings.join_request_auto_reject_timeout_hours ?? 0}
                onBlur={(e) => save({ join_request_auto_reject_timeout_hours: Number(e.target.value) })}
                onChange={(e) => setSettings({ ...settings, join_request_auto_reject_timeout_hours: Number(e.target.value) })} />
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Xususiyatlar</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Row label="Tug'ilgan kun eslatmalari"><Switch checked={!!settings.feature_birthdays} onCheckedChange={(v) => save({ feature_birthdays: v })} /></Row>
            <Row label="Tadbirlar"><Switch checked={!!settings.feature_events} onCheckedChange={(v) => save({ feature_events: v })} /></Row>
            <Row label="Statistikani ommaviy ko'rsatish"><Switch checked={!!settings.feature_stats_public} onCheckedChange={(v) => save({ feature_stats_public: v })} /></Row>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="flex-1">{label}</Label>
      {children}
    </div>
  );
}
