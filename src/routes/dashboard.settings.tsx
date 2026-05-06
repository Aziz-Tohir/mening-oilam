import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyFamilies, regenerateInviteCode, getInviteInfo } from "@/server/families.functions";
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
  const [invite, setInvite] = useState<{ invite_code: string | null; bot_username: string | null } | null>(null);

  useEffect(() => {
    callServer(listMyFamilies)
      .then(r => { setFamilies(r.families); if (r.families[0]) setFamilyId(r.families[0].id); })
      .catch((e: any) => toast.error(e?.message ?? "Oilalarni yuklab bo'lmadi"));
  }, []);
  useEffect(() => {
    if (familyId) {
      callServer(getSettings, { familyId })
        .then(r => setSettings(r.settings))
        .catch((e: any) => toast.error(e?.message ?? "Sozlamalarni yuklab bo'lmadi"));
      callServer(getInviteInfo, { familyId })
        .then(r => setInvite(r))
        .catch(() => {});
    }
  }, [familyId]);

  const regenInvite = async () => {
    try {
      const r = await callServer(regenerateInviteCode, { familyId });
      setInvite(prev => ({ invite_code: r.invite_code, bot_username: prev?.bot_username ?? null }));
      toast.success("Yangi taklif kodi yaratildi");
    } catch (e: any) { toast.error(e?.message ?? "Xato"); }
  };

  const inviteLink = invite?.bot_username && invite?.invite_code
    ? `https://t.me/${invite.bot_username}?start=fam_${invite.invite_code}`
    : null;

  const save = async (patch: any) => {
    setSettings({ ...settings, ...patch });
    try { await callServer(updateSettings, { familyId, patch }); toast.success("Saqlandi"); }
    catch (e: any) { toast.error(e?.message ?? "Saqlab bo'lmadi"); }
  };

  if (!settings) return <p className="text-muted-foreground">Yuklanmoqda…</p>;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Sozlamalar</h1>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
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
            <Row label="Botdan ro'yxatdan o'tishni majburlash (guruhga to'g'ridan-to'g'ri kirganlar yoza olmaydi)">
              <Switch checked={(settings as any).enforce_bot_onboarding !== false} onCheckedChange={(v) => save({ enforce_bot_onboarding: v } as any)} />
            </Row>
            <Row label="Begona bot yuborgan mediani qayta yuklash (asl xabar o'chirib, oilamiz nomidan ulashadi)">
              <Switch checked={!!(settings as any).manage_foreign_bot_media} onCheckedChange={(v) => save({ manage_foreign_bot_media: v } as any)} />
            </Row>
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
          <CardHeader><CardTitle>Taklif havolasi</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {inviteLink ? (
              <>
                <Label className="text-sm text-muted-foreground">Bu havolani yuborgan kishi to'g'ridan-to'g'ri shu oilaga so'rov yuboradi.</Label>
                <div className="flex gap-2">
                  <Input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
                  <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(inviteLink); toast.success("Nusxalandi"); }}>Nusxa</Button>
                </div>
                <div className="flex items-center justify-between">
                  <code className="text-xs text-muted-foreground">{invite?.invite_code}</code>
                  <Button size="sm" variant="secondary" onClick={regenInvite}>Yangi kod</Button>
                </div>
              </>
            ) : invite && !invite.bot_username ? (
              <p className="text-sm text-muted-foreground">BOT_USERNAME sozlanmagan.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>
            )}
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

        <Card>
          <CardHeader><CardTitle>Ayollar rasmi maxfiyligi</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Label className="text-sm text-muted-foreground">
              Ayol a'zolarning profil rasmi kimlarga ko'rinishini tanlang.
            </Label>
            <Select
              value={settings.female_photo_visibility ?? "public"}
              onValueChange={(v) => save({ female_photo_visibility: v })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Ochiq — hammaga ko'rinadi</SelectItem>
                <SelectItem value="private_default">Yangi ayol a'zoda avto-maxfiy</SelectItem>
                <SelectItem value="female_only">Faqat ayollarga ko'rinsin</SelectItem>
                <SelectItem value="always_hidden">Hech kimga ko'rinmasin</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A'zo o'z rasmini har doim ko'radi. "Avto-maxfiy" rejimida yangi ayollar rasmi yopiq boshlanadi.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Log guruhi (forum + topiclar)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Telegram'da forum (topiclar yoqilgan) guruh oching, botni admin qilib qo'shing va har bir bo'lim uchun alohida topic yarating.
              Topic ID ni topic havolasidan olish mumkin: <code>t.me/c/&lt;chat&gt;/&lt;topic_id&gt;</code>.
              Agar topic bo'sh qoldirilsa, xabar guruhning bosh oqimiga (General) yuboriladi.
            </p>
            <Row label="Log guruh chat ID (forum)">
              <Input className="w-44" type="number" value={settings.log_telegram_chat_id ?? ""}
                onBlur={(e) => save({ log_telegram_chat_id: e.target.value ? Number(e.target.value) : null })}
                onChange={(e) => setSettings({ ...settings, log_telegram_chat_id: e.target.value ? Number(e.target.value) : null })} />
            </Row>
            <Row label="Topic: Amallar (action_logs)">
              <Input className="w-32" type="number" value={settings.log_topic_actions ?? ""}
                onBlur={(e) => save({ log_topic_actions: e.target.value ? Number(e.target.value) : null })}
                onChange={(e) => setSettings({ ...settings, log_topic_actions: e.target.value ? Number(e.target.value) : null })} />
            </Row>
            <Row label="Topic: Admin (qo'shilish so'rovlari)">
              <Input className="w-32" type="number" value={settings.log_topic_admin ?? ""}
                onBlur={(e) => save({ log_topic_admin: e.target.value ? Number(e.target.value) : null })}
                onChange={(e) => setSettings({ ...settings, log_topic_admin: e.target.value ? Number(e.target.value) : null })} />
            </Row>
            <Row label="Topic: Moderatsiya (delete/mute/ban)">
              <Input className="w-32" type="number" value={settings.log_topic_moderation ?? ""}
                onBlur={(e) => save({ log_topic_moderation: e.target.value ? Number(e.target.value) : null })}
                onChange={(e) => setSettings({ ...settings, log_topic_moderation: e.target.value ? Number(e.target.value) : null })} />
            </Row>
            <Row label="Topic: Backup (JSON dump)">
              <Input className="w-32" type="number" value={settings.log_topic_backup ?? ""}
                onBlur={(e) => save({ log_topic_backup: e.target.value ? Number(e.target.value) : null })}
                onChange={(e) => setSettings({ ...settings, log_topic_backup: e.target.value ? Number(e.target.value) : null })} />
            </Row>
            <Row label="Backup chastotasi">
              <Select value={settings.backup_frequency ?? "weekly"} onValueChange={(v) => save({ backup_frequency: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Har kuni</SelectItem>
                  <SelectItem value="weekly">Haftalik</SelectItem>
                  <SelectItem value="monthly">Oylik</SelectItem>
                  <SelectItem value="off">O'chirilgan</SelectItem>
                </SelectContent>
              </Select>
            </Row>
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
