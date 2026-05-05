import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyFamilies } from "@/server/families.functions";
import { listJoinRequests } from "@/server/admin.functions";
import { callServer } from "@/lib/serverCall";
import { relationshipLabel } from "@/lib/relationships";

export const Route = createFileRoute("/dashboard/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const [families, setFamilies] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState<string>("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callServer(listMyFamilies)
      .then(r => { setFamilies(r.families); if (r.families[0]) setFamilyId(r.families[0].id); else setLoading(false); })
      .catch((e: any) => { toast.error(e?.message ?? "Oilalarni yuklab bo'lmadi"); setLoading(false); });
  }, []);
  useEffect(() => {
    if (!familyId) return;
    setLoading(true);
    callServer(listJoinRequests, { familyId })
      .then(r => setRows(r.requests))
      .catch((e: any) => toast.error(e?.message ?? "So'rovlarni yuklab bo'lmadi"))
      .finally(() => setLoading(false));
  }, [familyId]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Qo'shilish so'rovlari</h1>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Tasdiq/rad etish Telegram bot DM orqali amalga oshiriladi.</p>
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Arizachi</th><th className="p-3">Aloqa</th><th className="p-3">Status</th><th className="p-3">Sana</th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Yuklanmoqda…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">So'rovlar yo'q</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{r.applicant_full_name} {r.applicant_username && <span className="text-muted-foreground">@{r.applicant_username}</span>}</td>
                <td className="p-3">{relationshipLabel(r.relationship_type)}</td>
                <td className="p-3"><Badge>{r.status}</Badge></td>
                <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
