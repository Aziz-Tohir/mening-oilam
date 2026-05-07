import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCachedServer, invalidateCache, callServer } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import {
  listAllFamilies,
  updateFamily,
  deleteFamily,
  transferFamilyOwnership,
} from "@/server/superadmin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/families")({
  component: FamiliesAdminPage,
});

type FamilyRow = {
  id: string;
  name: string;
  owner_user_id: string;
  telegram_group_id: number | null;
  telegram_group_title: string | null;
  created_at: string;
  members_count: number;
  owner: { email: string | null; display_name: string | null } | null;
};

function FamiliesAdminPage() {
  const { data, ts, stale, loading, refetch } = useCachedServer<{ families: FamilyRow[] }>(
    "superadmin:families", listAllFamilies,
  );
  const families = data?.families ?? [];
  const reload = () => { invalidateCache("superadmin:families"); refetch(); };

  const [editing, setEditing] = useState<FamilyRow | null>(null);
  const [transferring, setTransferring] = useState<FamilyRow | null>(null);
  const [deleting, setDeleting] = useState<FamilyRow | null>(null);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Oilalar boshqaruvi</h1>
        <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={reload} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Faqat superadmin uchun. Tizimdagi barcha oilalar.</p>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Nom</th>
              <th className="p-3">Egasi</th>
              <th className="p-3">A'zolar</th>
              <th className="p-3">Telegram</th>
              <th className="p-3">Yaratilgan</th>
              <th className="p-3 text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Yuklanmoqda…</td></tr>}
            {!loading && families.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Oilalar yo'q</td></tr>}
            {families.map(f => (
              <tr key={f.id} className="border-t border-border">
                <td className="p-3 font-medium">{f.name}</td>
                <td className="p-3 text-muted-foreground">
                  {f.owner?.display_name || f.owner?.email || <span className="font-mono text-xs">{f.owner_user_id.slice(0, 8)}…</span>}
                </td>
                <td className="p-3">{f.members_count}</td>
                <td className="p-3 text-muted-foreground">{f.telegram_group_title || "—"}</td>
                <td className="p-3 text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>Tahrir</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTransferring(f)}>Egasi</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleting(f)}>O'chirish</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editing && <EditDialog family={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {transferring && <TransferDialog family={transferring} onClose={() => setTransferring(null)} onSaved={reload} />}
      {deleting && <DeleteDialog family={deleting} onClose={() => setDeleting(null)} onDeleted={reload} />}
    </div>
  );
}

function EditDialog({ family, onClose, onSaved }: { family: FamilyRow; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(family.name);
  const [tgId, setTgId] = useState(family.telegram_group_id?.toString() ?? "");
  const [tgTitle, setTgTitle] = useState(family.telegram_group_title ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await callServer(updateFamily, {
        familyId: family.id,
        patch: {
          name,
          telegram_group_id: tgId ? Number(tgId) : null,
          telegram_group_title: tgTitle || null,
        },
      });
      toast.success("Saqlandi");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Oilani tahrirlash</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nomi</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Telegram guruh ID</Label>
            <Input value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="-1001234..." />
          </div>
          <div>
            <Label>Telegram guruh nomi</Label>
            <Input value={tgTitle} onChange={(e) => setTgTitle(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saqlanmoqda…" : "Saqlash"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ family, onClose, onSaved }: { family: FamilyRow; onClose: () => void; onSaved: () => void }) {
  const [newOwner, setNewOwner] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await callServer(transferFamilyOwnership, { familyId: family.id, newOwnerUserId: newOwner.trim() });
      toast.success("Egasi o'zgartirildi");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Xatolik");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Egasini o'zgartirish</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">"{family.name}" oilasining yangi egasini kiriting (User ID — UUID).</p>
          <div>
            <Label>Yangi egasi (user_id)</Label>
            <Input value={newOwner} onChange={(e) => setNewOwner(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <Button onClick={save} disabled={saving || !newOwner.trim()}>{saving ? "Saqlanmoqda…" : "O'zgartirish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ family, onClose, onDeleted }: { family: FamilyRow; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting2] = useState(false);

  const doDelete = async () => {
    setDeleting2(true);
    try {
      await callServer(deleteFamily, { familyId: family.id });
      toast.success("O'chirildi");
      onDeleted();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Xatolik");
    } finally {
      setDeleting2(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="text-destructive">Oilani o'chirish</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm">
            Bu amalni qaytarib bo'lmaydi. <b>"{family.name}"</b> oilasi va unga tegishli barcha ma'lumotlar
            ({family.members_count} a'zo, aloqalar, tadbirlar, xotiralar va boshqalar) butunlay o'chiriladi.
          </p>
          <div>
            <Label>Tasdiqlash uchun oila nomini yozing</Label>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={family.name} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Bekor</Button>
          <Button variant="destructive" onClick={doDelete} disabled={deleting || confirm !== family.name}>
            {deleting ? "O'chirilmoqda…" : "O'chirish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
