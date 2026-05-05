import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers, getSettings, updateSettings } from "@/server/admin.functions";
import {
  listBannedWords, addBannedWord, deleteBannedWord,
  listWarnings, addWarning, clearWarnings,
  moderateMember, sendBroadcast, listBroadcasts,
} from "@/server/bot.functions";
import { callServer } from "@/lib/serverCall";
import { toast } from "sonner";
import { Trash2, MessageSquare, ShieldAlert, Ban, UserX, VolumeX, Megaphone, Plus } from "lucide-react";

export const Route = createFileRoute("/dashboard/bot")({
  component: BotPage,
});

function BotPage() {
  const [families, setFamilies] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState("");

  useEffect(() => {
    callServer(listMyFamilies)
      .then(r => { setFamilies(r.families); if (r.families[0]) setFamilyId(r.families[0].id); })
      .catch((e: any) => toast.error(e?.message ?? "Oilalarni yuklab bo'lmadi"));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Bot boshqaruvi</h1>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Oila" /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {familyId && (
        <Tabs defaultValue="moderation">
          <TabsList className="flex w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="moderation"><ShieldAlert className="mr-1 h-4 w-4" />Moderatsiya</TabsTrigger>
            <TabsTrigger value="words">Taqiqlangan so'zlar</TabsTrigger>
            <TabsTrigger value="warnings">Ogohlantirishlar</TabsTrigger>
            <TabsTrigger value="actions">Kick / Ban</TabsTrigger>
            <TabsTrigger value="broadcast"><Megaphone className="mr-1 h-4 w-4" />E'lon</TabsTrigger>
          </TabsList>
          <TabsContent value="moderation"><ModerationTab familyId={familyId} /></TabsContent>
          <TabsContent value="words"><WordsTab familyId={familyId} /></TabsContent>
          <TabsContent value="warnings"><WarningsTab familyId={familyId} /></TabsContent>
          <TabsContent value="actions"><ActionsTab familyId={familyId} /></TabsContent>
          <TabsContent value="broadcast"><BroadcastTab familyId={familyId} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function ModerationTab({ familyId }: { familyId: string }) {
  const [s, setS] = useState<any>(null);
  useEffect(() => { callServer(getSettings, { familyId }).then(r => setS(r.settings)); }, [familyId]);
  const save = async (patch: any) => {
    setS({ ...s, ...patch });
    try { await callServer(updateSettings, { familyId, patch }); toast.success("Saqlandi"); }
    catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };
  if (!s) return <p className="text-muted-foreground">Yuklanmoqda…</p>;
  return (
    <Card>
      <CardHeader><CardTitle>Avtomatik moderatsiya qoidalari</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Row label="Havolalarni o'chirish (anti-link)">
          <Switch checked={!!s.anti_link} onCheckedChange={(v) => save({ anti_link: v })} />
        </Row>
        <Row label="Forward xabarlarni taqiqlash">
          <Switch checked={!!s.anti_forward} onCheckedChange={(v) => save({ anti_forward: v })} />
        </Row>
        <Row label="Flood himoyasi (xabar orasi sek, 0=o'chirilgan)">
          <Input type="number" className="w-24" defaultValue={s.anti_flood_seconds ?? 0}
            onBlur={(e) => save({ anti_flood_seconds: Number(e.target.value) })} />
        </Row>
        <Row label="Maksimal ogohlantirish (limit)">
          <Input type="number" className="w-24" defaultValue={s.max_warnings ?? 3}
            onBlur={(e) => save({ max_warnings: Number(e.target.value) })} />
        </Row>
        <Row label="Limit oshganda harakat">
          <Select value={s.warning_action ?? "kick"} onValueChange={(v) => save({ warning_action: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kick">Kick</SelectItem>
              <SelectItem value="ban">Ban</SelectItem>
              <SelectItem value="mute">Mute (1s)</SelectItem>
            </SelectContent>
          </Select>
        </Row>
        <div>
          <Label className="text-sm">Ruxsat etilgan domenlar (vergul bilan)</Label>
          <Input
            defaultValue={(s.allowed_link_domains ?? []).join(", ")}
            placeholder="t.me, youtube.com"
            onBlur={(e) => save({ allowed_link_domains: e.target.value.split(",").map(d => d.trim()).filter(Boolean) })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function WordsTab({ familyId }: { familyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [pattern, setPattern] = useState(""); const [isRegex, setIsRegex] = useState(false);
  const [action, setAction] = useState("delete");
  const reload = () => callServer(listBannedWords, { familyId }).then(r => setItems(r.items));
  useEffect(() => { reload(); }, [familyId]);
  const add = async () => {
    if (!pattern.trim()) return;
    try { await callServer(addBannedWord, { familyId, pattern, isRegex, action: action as any }); setPattern(""); reload(); toast.success("Qo'shildi"); }
    catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };
  const del = async (id: string) => { await callServer(deleteBannedWord, { familyId, id }); reload(); };
  return (
    <Card>
      <CardHeader><CardTitle>Taqiqlangan so'zlar / iboralar</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Input className="max-w-sm" value={pattern} onChange={e => setPattern(e.target.value)} placeholder="So'z yoki regex..." />
          <label className="flex items-center gap-2 text-sm"><Switch checked={isRegex} onCheckedChange={setIsRegex} />Regex</label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="delete">O'chirish</SelectItem>
              <SelectItem value="warn">Ogohlantirish</SelectItem>
              <SelectItem value="kick">Kick</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={add}><Plus className="mr-1 h-4 w-4" />Qo'shish</Button>
        </div>
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Hech narsa yo'q.</p>}
          {items.map(w => (
            <div key={w.id} className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm">{w.pattern}</code>
                {w.is_regex && <Badge variant="outline">regex</Badge>}
                <Badge>{w.action}</Badge>
              </div>
              <Button variant="ghost" size="icon" onClick={() => del(w.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WarningsTab({ familyId }: { familyId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [memberId, setMemberId] = useState(""); const [reason, setReason] = useState("");
  const reload = () => callServer(listWarnings, { familyId }).then(r => setItems(r.items));
  useEffect(() => {
    reload();
    callServer(listMembers, { familyId }).then(r => setMembers(r.members.filter((m: any) => m.status === "active")));
  }, [familyId]);
  const add = async () => {
    if (!memberId || !reason.trim()) return;
    try { await callServer(addWarning, { familyId, memberId, reason }); setReason(""); reload(); toast.success("Berildi"); }
    catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };
  const clear = async (mId: string) => { await callServer(clearWarnings, { familyId, memberId: mId }); reload(); };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Qo'lda ogohlantirish berish</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger className="w-56"><SelectValue placeholder="A'zo" /></SelectTrigger>
            <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="max-w-sm" placeholder="Sabab..." value={reason} onChange={e => setReason(e.target.value)} />
          <Button onClick={add}>Berish</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tarix</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Yo'q.</p>}
          {items.map(w => (
            <div key={w.id} className="flex items-center justify-between rounded border border-border bg-muted/30 px-3 py-2 text-sm">
              <div>
                <b>{w.member?.full_name ?? "?"}</b>
                {w.auto && <Badge variant="outline" className="ml-2">auto</Badge>}
                <span className="ml-2 text-muted-foreground">{w.reason}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{new Date(w.created_at).toLocaleString()}</span>
                <Button size="sm" variant="ghost" onClick={() => clear(w.member_id)}>Tozalash</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ActionsTab({ familyId }: { familyId: string }) {
  const [members, setMembers] = useState<any[]>([]);
  const [memberId, setMemberId] = useState("");
  useEffect(() => { callServer(listMembers, { familyId }).then(r => setMembers(r.members)); }, [familyId]);
  const act = async (action: any) => {
    if (!memberId) return;
    try { await callServer(moderateMember, { familyId, memberId, action }); toast.success("Bajarildi"); }
    catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>A'zoga nisbatan harakat</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Select value={memberId} onValueChange={setMemberId}>
          <SelectTrigger className="w-72"><SelectValue placeholder="A'zoni tanlang" /></SelectTrigger>
          <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => act("kick")}><UserX className="mr-1 h-4 w-4" />Kick</Button>
          <Button variant="destructive" onClick={() => act("ban")}><Ban className="mr-1 h-4 w-4" />Ban</Button>
          <Button variant="outline" onClick={() => act("mute_1h")}><VolumeX className="mr-1 h-4 w-4" />Mute 1s</Button>
          <Button variant="outline" onClick={() => act("mute_24h")}><VolumeX className="mr-1 h-4 w-4" />Mute 24s</Button>
          <Button variant="ghost" onClick={() => act("unban")}>Unban</Button>
        </div>
        <p className="text-xs text-muted-foreground">Eslatma: bot guruhda admin bo'lishi shart.</p>
      </CardContent>
    </Card>
  );
}

function BroadcastTab({ familyId }: { familyId: string }) {
  const [target, setTarget] = useState<"group"|"members">("group");
  const [text, setText] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [sending, setSending] = useState(false);
  const reload = () => callServer(listBroadcasts, { familyId }).then(r => setHistory(r.items));
  useEffect(() => { reload(); }, [familyId]);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const r = await callServer(sendBroadcast, { familyId, target, text });
      toast.success(`Yuborildi: ${r.recipients}, xato: ${r.failures}`);
      setText(""); reload();
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
    setSending(false);
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle><MessageSquare className="mr-1 inline h-4 w-4" />Xabar yuborish</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Select value={target} onValueChange={(v) => setTarget(v as any)}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="group">Guruhga</SelectItem>
              <SelectItem value="members">Har bir a'zoga DM</SelectItem>
            </SelectContent>
          </Select>
          <Textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Xabar matnini yozing..." />
          <Button onClick={send} disabled={sending || !text.trim()}>{sending ? "Yuborilmoqda…" : "Yuborish"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Tarix</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 && <p className="text-sm text-muted-foreground">Yo'q.</p>}
          {history.map(b => (
            <div key={b.id} className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <Badge>{b.target}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()} · ✓{b.recipients_count} ✗{b.failures_count}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap">{b.message_text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
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
