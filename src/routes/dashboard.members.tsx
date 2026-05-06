import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers, setMemberStatus, updateMember } from "@/server/admin.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { relationshipLabel } from "@/lib/relationships";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
});

function MembersPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data: memRes, loading, refetch, ts: memTs, stale: memStale } = useCachedServer<{ members: any[] }>(
    `members:${familyId}`, listMembers, { familyId }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const members = memRes?.members ?? [];

  const toggleBlock = async (m: any) => {
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
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => toggleBlock(m)}>
                    {m.status === "blocked" ? "Blokdan chiqarish" : "Bloklash"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
