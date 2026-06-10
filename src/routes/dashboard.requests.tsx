import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyFamilies } from "@/services/families.functions";
import { listJoinRequests } from "@/services/admin.functions";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { relationshipLabel } from "@/lib/relationships";

export const Route = createFileRoute("/dashboard/requests")({
  component: RequestsPage,
});

function RequestsPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies);
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data, ts, stale, loading, refetch } = useCachedServer<{ requests: any[] }>(
    `requests:${familyId}`, listJoinRequests, { familyId }, { enabled: !!familyId },
  );
  const rows = data?.requests ?? [];
  const reload = () => { invalidateCache(`requests:${familyId}`); refetch(); };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Qo'shilish so'rovlari</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={reload} />
        </div>
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
            {loading && !data && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Yuklanmoqda…</td></tr>}
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
