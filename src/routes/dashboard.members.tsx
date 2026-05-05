import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers, setMemberStatus, updateMember } from "@/server/admin.functions";
import { callServer } from "@/lib/serverCall";
import { relationshipLabel } from "@/lib/relationships";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/members")({
  component: MembersPage,
});

function MembersPage() {
  const [families, setFamilies] = useState<any[]>([]);
  const [familyId, setFamilyId] = useState<string>("");
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => { callServer(listMyFamilies).then(r => { setFamilies(r.families); if (r.families[0]) setFamilyId(r.families[0].id); }); }, []);
  useEffect(() => { if (familyId) callServer(listMembers, { familyId }).then(r => setMembers(r.members)); }, [familyId]);

  const toggleBlock = async (m: any) => {
    const next = m.status === "blocked" ? "active" : "blocked";
    await callServer(setMemberStatus, { familyId, memberId: m.id, status: next });
    toast.success("Yangilandi");
    callServer(listMembers, { familyId }).then(r => setMembers(r.members));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">A'zolar</h1>
        <Select value={familyId} onValueChange={setFamilyId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Oila tanlang" /></SelectTrigger>
          <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr><th className="p-3">Ism</th><th className="p-3">Username</th><th className="p-3">Aloqa</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Hali a'zo yo'q</td></tr>}
            {members.map(m => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3 font-medium">{m.full_name}</td>
                <td className="p-3 text-muted-foreground">{m.username ? "@" + m.username : "—"}</td>
                <td className="p-3">{relationshipLabel(m.relationship_to_inviter)}</td>
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
