import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/services/families.functions";
import { listLogs } from "@/services/admin.functions";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";

export const Route = createFileRoute("/dashboard/logs")({
  component: LogsPage,
});

type LogRow = {
  id: number;
  action: string;
  actor_telegram_id: number | null;
  actor_user_id: string | null;
  details: any;
  family_id: string | null;
  created_at: string;
};

function LogsPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const cacheKey = `logs:${familyId}`;
  const { data, loading, refetch, ts, stale } = useCachedServer<{ logs: LogRow[] }>(
    cacheKey, listLogs, { familyId, limit: 100 }, { enabled: !!familyId, staleMs: 60_000 },
  );
  const logs = data?.logs ?? [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Amallar jurnali</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={() => { invalidateCache(cacheKey); refetch(); }} />
        </div>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue placeholder="Oila tanlang" /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Vaqt</th>
              <th className="p-3">Amal</th>
              <th className="p-3">Ijrochi</th>
              <th className="p-3">Tafsilot</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading && (
              <tr><td className="p-6 text-center text-muted-foreground" colSpan={4}>Loglar yo'q</td></tr>
            )}
            {logs.map(l => (
              <tr key={l.id} className="border-t border-border align-top">
                <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                <td className="p-3"><Badge variant="secondary">{l.action}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">
                  {l.actor_user_id ? <div>user: {l.actor_user_id.slice(0, 8)}…</div> : null}
                  {l.actor_telegram_id ? <div>tg: {l.actor_telegram_id}</div> : null}
                </td>
                <td className="p-3">
                  {l.details ? (
                    <pre className="max-w-md overflow-x-auto rounded bg-muted/50 p-2 text-xs">{JSON.stringify(l.details, null, 2)}</pre>
                  ) : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
