import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { getMyMemberships, updateMyProfile, importTelegramPhoto } from "@/server/profile.functions";
import { supabase } from "@/integrations/supabase/client";

import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/profile")({
  component: ProfilePage,
});

type Membership = {
  id: string;
  family_id: string;
  full_name: string;
  birth_date: string | null;
  gender: "male" | "female" | null;
  phone: string | null;
  bio: string | null;
  photo_url: string | null;
  photo_is_private: boolean;
  username: string | null;
  telegram_id: number | null;
  status: string;
  families: { id: string; name: string } | null;
};

function ProfilePage() {
  const { data, loading, refetch, ts, stale } = useCachedServer<{ memberships: Membership[] }>(
    "profile:me", getMyMemberships, undefined, { staleMs: 1_800_000 },
  );
  const memberships = data?.memberships ?? [];
  const [activeId, setActiveId] = useState<string>("");
  useEffect(() => { if (!activeId && memberships[0]) setActiveId(memberships[0].id); }, [memberships, activeId]);
  const m = memberships.find((x) => x.id === activeId);

  const [form, setForm] = useState({
    full_name: "", birth_date: "", gender: "" as "" | "male" | "female",
    phone: "", bio: "", photo_url: "", photo_is_private: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!m) return;
    setForm({
      full_name: m.full_name ?? "",
      birth_date: m.birth_date ?? "",
      gender: (m.gender ?? "") as any,
      phone: m.phone ?? "",
      bio: m.bio ?? "",
      photo_url: m.photo_url ?? "",
      photo_is_private: m.photo_is_private ?? false,
    });
  }, [m?.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!m) return;
    setSaving(true);
    try {
      await callServer(updateMyProfile, {
        memberId: m.id,
        patch: {
          full_name: form.full_name.trim(),
          birth_date: form.birth_date || null,
          gender: (form.gender || null) as any,
          phone: form.phone.trim() || null,
          bio: form.bio || null,
          photo_url: form.photo_url.trim() || null,
          photo_is_private: form.photo_is_private,
        },
      });
      toast.success("Profil saqlandi");
      invalidateCache("profile:");
      invalidateCache(`members:${m.family_id}`);
      invalidateCache("dashboard:");
      refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Saqlab bo'lmadi");
    } finally {
      setSaving(false);
    }
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!m) return;
    if (!file.type.startsWith("image/")) { toast.error("Faqat rasm fayli"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Rasm 5MB dan kichik bo'lishi kerak"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Tizimga kiring");
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const key = `${user.id}/${m.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(key, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(key);
      setForm((f) => ({ ...f, photo_url: pub.publicUrl }));
      toast.success("Rasm yuklandi. Saqlash tugmasini bosing.");
    } catch (e: any) {
      toast.error(e?.message ?? "Yuklab bo'lmadi");
    } finally {
      setUploading(false);
    }
  };

  const importTg = async () => {
    if (!m) return;
    setUploading(true);
    try {
      const res = await callServer(importTelegramPhoto, { memberId: m.id });
      setForm((f) => ({ ...f, photo_url: (res as any).photo_url }));
      invalidateCache("profile:");
      invalidateCache(`members:${m.family_id}`);
      refetch();
      toast.success("Telegram rasmingiz olindi");
    } catch (e: any) {
      toast.error(e?.message ?? "Telegram rasmini olib bo'lmadi");
    } finally {
      setUploading(false);
    }
  };

  if (loading && !data) return <div className="text-muted-foreground">Yuklanmoqda…</div>;

  if (memberships.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Profil</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Siz hali biror oilaning a'zosi emassiz. Botda /start bosing yoki adminga murojaat qiling.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Mening profilim</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} />
        </div>
        {memberships.length > 1 && (
          <Select value={activeId} onValueChange={setActiveId}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Oila" /></SelectTrigger>
            <SelectContent>
              {memberships.map((x) => (
                <SelectItem key={x.id} value={x.id}>{x.families?.name ?? "Oila"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {m && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {m.families?.name ?? "Oila"} <Badge variant="outline">{m.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {form.photo_url ? (
                    <img src={form.photo_url} alt="" className="h-20 w-20 rounded-full object-cover border border-border" />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-lg font-semibold">
                      {(form.full_name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("")}
                    </div>
                  )}
                  <div className="flex flex-1 flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                    />
                    <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? "Yuklanmoqda…" : "Rasm yuklash"}
                    </Button>
                    {m.telegram_id && (
                      <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={importTg}>
                        Telegram rasmini olish
                      </Button>
                    )}
                    {form.photo_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, photo_url: "" })}>
                        O'chirish
                      </Button>
                    )}
                  </div>
                </div>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Yoki rasmni URL orqali kiriting</summary>
                  <Input className="mt-2" value={form.photo_url} onChange={(e) => setForm({ ...form, photo_url: e.target.value })} placeholder="https://…" />
                </details>
              </div>


              <div className="flex items-center justify-between rounded border border-border p-3">
                <div>
                  <Label className="text-sm">Foto faqat oila a'zolariga</Label>
                  <p className="text-xs text-muted-foreground">Yoqilsa, telegram guruhdan tashqarida ko'rinmaydi</p>
                </div>
                <Switch checked={form.photo_is_private} onCheckedChange={(v) => setForm({ ...form, photo_is_private: v })} />
              </div>

              <div><Label>To'liq ism *</Label>
                <Input required maxLength={128} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

              <div><Label>O'zim haqimda</Label>
                <Textarea maxLength={1000} rows={4} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">{form.bio.length}/1000</p>
              </div>

              {(m.username || m.telegram_id) && (
                <div className="rounded border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Telegram: {m.username ? `@${m.username}` : `ID ${m.telegram_id}`}
                </div>
              )}

              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saqlanmoqda…" : "Saqlash"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
