import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/services/families.functions";
import { listMemories, listNominations } from "@/services/awards.functions";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";

export const Route = createFileRoute("/dashboard/memories")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies);
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const { data: memRes, ts: memTs, stale: memStale, loading: memLoading, refetch: refetchMem } = useCachedServer<{ memories: any[] }>(
    `memories:${familyId}:${year}`, listMemories, { familyId, year }, { enabled: !!familyId },
  );
  const { data: nomRes, ts: nomTs, stale: nomStale, loading: nomLoading, refetch: refetchNom } = useCachedServer<{ nominations: any[] }>(
    `nominations:${familyId}:${year}`, listNominations, { familyId, year }, { enabled: !!familyId },
  );
  const memories = memRes?.memories ?? [];
  const nominations = nomRes?.nominations ?? [];

  const reload = () => {
    invalidateCache(`memories:${familyId}:${year}`);
    invalidateCache(`nominations:${familyId}:${year}`);
    refetchMem(); refetchNom();
  };

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Xotiralar va Mukofotlar</h1>
          <CacheStatus
            ts={Math.max(memTs ?? 0, nomTs ?? 0) || null}
            stale={memStale || nomStale}
            loading={(memLoading && !memRes) || (nomLoading && !nomRes)}
            onRefresh={reload}
          />
        </div>
        <div className="flex gap-2">
          <Select value={familyId} onValueChange={setFamilyId}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Oila" /></SelectTrigger>
            <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>🏆 {year}-yil mukofotlari</CardTitle></CardHeader>
        <CardContent>
          {nominations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hozircha mukofotlar yo'q. Ular har yil 1-yanvarda hisoblanadi.</p>
          ) : (
            <ul className="space-y-2">
              {nominations.map(n => (
                <li key={n.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                  <div>
                    <div className="font-medium">{n.category}</div>
                    <div className="text-sm text-muted-foreground">{n.member_name ?? "—"}</div>
                  </div>
                  {n.metric_value != null && <Badge variant="secondary">{n.metric_value}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>📸 {year}-yil xotiralari ({memories.length})</CardTitle></CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Guruhda yuborilgan rasm/video bu yerda saqlanadi.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {memories.map(m => (
                <li key={m.id} className="rounded border border-border px-3 py-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{m.kind}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</span>
                  </div>
                  {m.caption && <p className="mt-1 whitespace-pre-wrap">{m.caption}</p>}
                  <code className="text-[10px] text-muted-foreground break-all">{m.telegram_file_id}</code>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
