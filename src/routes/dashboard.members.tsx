import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers, setMemberStatus, updateMember } from "@/server/admin.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { relationshipLabel, RELATIONSHIP_OPTIONS } from "@/lib/relationships";
import { useUserRole } from "@/hooks/useUserRole";
import { processImageForUpload, formatBytes } from "@/utils/imageProcess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
});

type Member = {
  id: string;
  family_id: string;
  full_name: string;
  username: string | null;
  birth_date: string | null;
  gender: "male" | "female" | null;
  phone: string | null;
  bio: string | null;
  photo_url: string | null;
  photo_is_private: boolean;
  status: string;
  relationship_to_inviter: string | null;
  telegram_id: number | null;
};

function MembersPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data: memRes, loading, refetch, ts: memTs, stale: memStale } = useCachedServer<{ members: Member[] }>(
    `members:${familyId}`, listMembers, { familyId }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const members = memRes?.members ?? [];
  const { isAdmin } = useUserRole();

  const [editing, setEditing] = useState<Member | null>(null);

  const toggleBlock = async (m: Member) => {
    const next = m.status === "blocked" ? "active" : "blocked";
    try {
      await callServer(setMemberStatus, { familyId, memberId: m.id, status: next });
      toast.success("Yangilandi");
      invalidateCache(`members:${familyId}`);
      refetch();
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">A'zolar</h1><CacheStatus ts={memTs} stale={memStale} loading={loading && !memRes} onRefresh={() => { invalidateCache(`members:${familyId}`); refetch(); }} /></div>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Oila tanlang" /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Ism</th><th className="p-3">Username</th><th className="p-3">Aloqa</th><th className="p-3">Tug'ilgan kun</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Yuklanmoqda…</td></tr>}
            {!loading && members.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Hali a'zo yo'q</td></tr>}
            {members.map(m => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3 font-medium">{m.full_name}</td>
                <td className="p-3 text-muted-foreground">{m.username ? "@" + m.username : "—"}</td>
                <td className="p-3">{relationshipLabel(m.relationship_to_inviter)}</td>
                <td className="p-3">
                  <Input type="date" defaultValue={m.birth_date ?? ""} className="h-8 w-36"
                    onBlur={async (e) => {
                      const v = e.target.value || null;
                      if (v === (m.birth_date ?? null)) return;
                      try {
                        await callServer(updateMember, { familyId, memberId: m.id, patch: { birth_date: v } });
                        toast.success("Saqlandi");
                        invalidateCache(`members:${familyId}`);
                        refetch();
                      } catch (err: any) { toast.error(err?.message ?? "Saqlab bo'lmadi"); }
                    }} />
                </td>
                <td className="p-3"><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge></td>
                <td className="p-3 text-right space-x-2 whitespace-nowrap">
                  {isAdmin && (
                    <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>Tahrirlash</Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => toggleBlock(m)}>
                    {m.status === "blocked" ? "Blokdan chiqarish" : "Bloklash"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && (
        <EditMemberDialog
          member={editing}
          familyId={familyId}
          onClose={() => setEditing(null)}
          onSaved={() => { invalidateCache(`members:${familyId}`); refetch(); setEditing(null); }}
        />
      )}
    </div>
  );
}

function EditMemberDialog({ member, familyId, onClose, onSaved }: { member: Member; familyId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: member.full_name ?? "",
    username: member.username ?? "",
    birth_date: member.birth_date ?? "",
    gender: (member.gender ?? "") as "" | "male" | "female",
    phone: member.phone ?? "",
    bio: member.bio ?? "",
    relationship_to_inviter: member.relationship_to_inviter ?? "",
    status: member.status as "active" | "blocked" | "pending",
    photo_url: member.photo_url ?? "",
    photo_is_private: !!member.photo_is_private,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Faqat rasm fayli"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Rasm 15MB dan kichik bo'lishi kerak"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tizimga kiring");
      let blob: Blob = file;
      let ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      let contentType = file.type;
      let note = "";
      try {
        const p = await processImageForUpload(file);
        blob = p.blob; ext = p.ext; contentType = p.contentType;
        note = ` (${formatBytes(file.size)} → ${formatBytes(p.blob.size)})`;
      } catch (e) { console.warn(e); }
      const key = `${user.id}/admin-${member.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(key, blob, { upsert: true, contentType });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(key);
      setForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      toast.success(`Rasm yuklandi${note}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Yuklab bo'lmadi");
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await callServer(updateMember, {
        familyId,
        memberId: member.id,
        patch: {
          full_name: form.full_name.trim(),
          username: form.username.trim() || null,
          birth_date: form.birth_date || null,
          gender: (form.gender || null) as any,
          phone: form.phone.trim() || null,
          bio: form.bio || null,
          relationship_to_inviter: form.relationship_to_inviter || null,
          status: form.status,
          photo_url: form.photo_url.trim() || null,
          photo_is_private: form.photo_is_private,
        },
      });
      toast.success("Saqlandi");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>A'zoni tahrirlash</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex items-center gap-3">
            {form.photo_url ? (
              <img src={form.photo_url} alt="" className="h-16 w-16 rounded-full object-cover border border-border" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                {(form.full_name || "?").split(" ").map(s => s[0]).slice(0, 2).join("")}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? "Yuklanmoqda…" : "Rasm yuklash"}
              </Button>
              {form.photo_url && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, photo_url: "" })}>
                  O'chirish
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-2">
            <div>
              <Label className="text-xs">Foto faqat oila a'zolariga</Label>
            </div>
            <Switch checked={form.photo_is_private} onCheckedChange={(v) => setForm({ ...form, photo_is_private: v })} />
          </div>

          <div><Label>To'liq ism *</Label>
            <Input required maxLength={128} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div><Label>Username</Label>
            <Input maxLength={64} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username (without @)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tug'ilgan kun</Label>
              <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>
            <div><Label>Jins</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as any })}>
                <SelectTrigger><SelectValue placeholder="Tanlanmagan" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Erkak</SelectItem>
                  <SelectItem value="female">Ayol</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div><Label>Telefon</Label>
            <Input type="tel" maxLength={32} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+998…" />
          </div>

          <div><Label>Aloqa (qarindoshlik)</Label>
            <Select value={form.relationship_to_inviter} onValueChange={(v) => setForm({ ...form, relationship_to_inviter: v })}>
              <SelectTrigger><SelectValue placeholder="Tanlanmagan" /></SelectTrigger>
              <SelectContent>
                {RELATIONSHIP_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="blocked">blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div><Label>Bio</Label>
            <Textarea maxLength={1000} rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Bekor qilish</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saqlanmoqda…" : "Saqlash"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
