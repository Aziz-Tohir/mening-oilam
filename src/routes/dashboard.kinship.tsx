import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers } from "@/server/admin.functions";
import { computeKinship } from "@/server/kinship.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/kinship")({
  component: KinshipPage,
});

function KinshipPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies);
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data: memRes, ts, stale, loading: memLoading, refetch } = useCachedServer<{ members: any[] }>(
    `members:${familyId}`, listMembers, { familyId }, { enabled: !!familyId },
  );
  const members = useMemo(() => (memRes?.members ?? []).filter((m: any) => m.status === "active"), [memRes]);
  const reload = () => { invalidateCache(`members:${familyId}`); refetch(); };

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setResult(null); setFrom(""); setTo(""); }, [familyId]);

  const memberById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m])), [members]);

  const compute = async () => {
    if (!from || !to) return;
    setLoading(true); setResult(null);
    try {
      const res = await callServer(computeKinship, { familyId, fromMemberId: from, toMemberId: to });
      setResult(res);
    } catch (e: any) { toast.error(e?.message ?? "Hisoblab bo'lmadi"); }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Kim kimga kim?</h1>
          <CacheStatus ts={ts} stale={stale} loading={memLoading && !memRes} onRefresh={reload} />
        </div>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Oila" /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Ikki a'zoni tanlang</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Kim?</label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger><SelectValue placeholder="A'zoni tanlang" /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Kimga?</label>
              <Select value={to} onValueChange={setTo}>
                <SelectTrigger><SelectValue placeholder="A'zoni tanlang" /></SelectTrigger>
                <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={compute} disabled={!from || !to || from === to || loading}>
            {loading ? "Hisoblanmoqda…" : "Hisoblash"}
          </Button>

          {result && (
            <div className="mt-4 rounded-md border border-border bg-muted/30 p-4">
              {!result.found ? (
                <p className="text-sm text-muted-foreground">Bu ikki a'zo orasida aloqa topilmadi. Avval qarindoshlik aloqalarini qo'shing.</p>
              ) : (
                <>
                  <p className="text-base">
                    <b>{result.to}</b> — <b>{result.from}</b>ga{" "}
                    <Badge className="ml-1 text-base">{result.label}</Badge>
                  </p>
                  {result.chain.length > 1 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Yo'l: {result.path.map((id: string) => memberById[id]?.full_name ?? "?").join(" → ")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
