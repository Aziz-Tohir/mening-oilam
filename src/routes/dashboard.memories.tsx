import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/server/families.functions";
import { listMemories, listNominations } from "@/server/awards.functions";
import { callServer } from "@/lib/serverCall";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/memories")({
  component: MemoriesPage,
});

function MemoriesPage() {
  const [families, setFamilies] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [memories, setMemories] = useState<any[]>([]);
  const [nominations, setNominations] = useState<any[]>([]);

  useEffect(() => {
    callServer(listMyFamilies).then(r => {
      setFamilies(r.families);
      if (r.families[0]) setFamilyId(r.families[0].id);
    });
  }, []);

  useEffect(() => {
    if (!familyId) return;
    callServer(listMemories, { familyId, year }).then(r => setMemories(r.memories)).catch((e: any) => toast.error(e?.message));
    callServer(listNominations, { familyId, year }).then(r => setNominations(r.nominations)).catch(() => {});
  }, [familyId, year]);

  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Xotiralar va Mukofotlar</h1>
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
