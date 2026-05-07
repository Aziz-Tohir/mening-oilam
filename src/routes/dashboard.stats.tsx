import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMyFamilies } from "@/server/families.functions";
import { getFamilyMessageStats } from "@/server/stats.functions";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export const Route = createFileRoute("/dashboard/stats")({
  component: StatsPage,
});

function medal(i: number) {
  return i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`;
}

function StatsPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies);
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data, ts, stale, loading, refetch } = useCachedServer<{ top: any[]; trend: any[]; total: number }>(
    `stats:${familyId}`, getFamilyMessageStats, { familyId, days: 30 }, { enabled: !!familyId },
  );
  const reload = () => { invalidateCache(`stats:${familyId}`); refetch(); };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">📊 Statistika va Reyting</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={reload} />
        </div>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!data ? <p className="mt-6 text-muted-foreground">Yuklanmoqda…</p> : (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Oxirgi 30 kun</CardTitle></CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">Jami xabarlar: <b>{data.total}</b></p>
              {data.trend.length === 0 ? <p className="text-sm text-muted-foreground">Ma'lumot yo'q</p> : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.trend}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="hsl(var(--primary))" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Top 20 a'zo</CardTitle></CardHeader>
            <CardContent>
              {data.top.length === 0 ? <p className="text-sm text-muted-foreground">Ma'lumot yo'q</p> : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-12">#</TableHead><TableHead>Ism</TableHead><TableHead className="text-right">Xabarlar</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.top.map((u, i) => (
                      <TableRow key={i}>
                        <TableCell>{medal(i)}</TableCell>
                        <TableCell>{u.name}</TableCell>
                        <TableCell className="text-right font-mono">{u.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
