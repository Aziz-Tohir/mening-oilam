import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState,
  addEdge, type Connection, type Node, type Edge, Handle, Position, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { toPng } from "html-to-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { listMyFamilies } from "@/server/families.functions";
import { listMembers, listRelationships, addRelationship } from "@/server/admin.functions";
import { exportFamilyTreeJson } from "@/server/tree.functions";
import { callServer, useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/tree")({
  component: TreePage,
});

const REL_TYPES = [
  "father","mother","son","daughter","brother","sister","husband","wife",
  "uncle_paternal","uncle_maternal","aunt_paternal","aunt_maternal",
  "cousin_male","cousin_female","grandfather","grandmother","grandson","granddaughter",
  "father_in_law","mother_in_law","son_in_law","daughter_in_law",
  "brother_in_law","sister_in_law","nephew","niece","other",
];

const REL_LABELS: Record<string, string> = {
  father: "Ota", mother: "Ona", son: "O'g'il", daughter: "Qiz",
  brother: "Aka/Uka", sister: "Opa/Singil", husband: "Er", wife: "Xotin",
  grandfather: "Bobo", grandmother: "Buvi", grandson: "Nabira (o'g'il)", granddaughter: "Nabira (qiz)",
  uncle_paternal: "Amaki", uncle_maternal: "Tog'a", aunt_paternal: "Amma", aunt_maternal: "Xola",
  cousin_male: "Amakivachcha (er)", cousin_female: "Amakivachcha (q)",
  father_in_law: "Qaynota", mother_in_law: "Qaynona",
  son_in_law: "Kuyov", daughter_in_law: "Kelin",
  brother_in_law: "Qaynaga", sister_in_law: "Qaynsingil",
  nephew: "Jiyan (o'g'il)", niece: "Jiyan (q)", other: "Boshqa",
};

// Hierarchical pairs: parent->child
const PARENT_REL = new Set(["father","mother","grandfather","grandmother","father_in_law","mother_in_law","uncle_paternal","uncle_maternal","aunt_paternal","aunt_maternal"]);
const CHILD_REL = new Set(["son","daughter","grandson","granddaughter","son_in_law","daughter_in_law","nephew","niece"]);

function MemberNode({ data }: { data: any }) {
  const initials = (data.full_name || "?").split(" ").map((s: string) => s[0]).slice(0,2).join("");
  const bg = data.gender === "male" ? "bg-blue-500/10 border-blue-500/40" : data.gender === "female" ? "bg-pink-500/10 border-pink-500/40" : "bg-muted border-border";
  return (
    <div className={`rounded-xl border-2 px-3 py-2 shadow-sm min-w-[140px] ${bg} ${data.faded ? "opacity-30" : ""}`}>
      <Handle type="target" position={Position.Top} className="!bg-foreground/40" />
      <div className="flex items-center gap-2">
        {data.photo_url ? (
          <img src={data.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-xs font-semibold">{initials}</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.full_name}</div>
          {data.birth_date && <div className="text-[10px] text-muted-foreground">{new Date(data.birth_date).getFullYear()}</div>}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-foreground/40" />
    </div>
  );
}

const nodeTypes = { member: MemberNode };

function layoutDagre(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 170, height: 70 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - 85, y: p.y - 35 } };
  });
}

function TreePage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies, undefined, { staleMs: 1_800_000 });
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState("");
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data: memRes, refetch: refetchMembers, ts: memTs, stale: memStale, loading: memLoading } = useCachedServer<{ members: any[] }>(
    `members:${familyId}`, listMembers, { familyId }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const { data: relRes, refetch: refetchRels, ts: relTs, stale: relStale, loading: relLoading } = useCachedServer<{ relationships: any[] }>(
    `rels:${familyId}`, listRelationships, { familyId }, { enabled: !!familyId, staleMs: 1_800_000 },
  );
  const members = useMemo(() => memRes?.members ?? [], [memRes]);
  const rels = useMemo(() => relRes?.relationships ?? [], [relRes]);

  const reload = useCallback(() => {
    invalidateCache(`members:${familyId}`);
    invalidateCache(`rels:${familyId}`);
    refetchMembers();
    refetchRels();
  }, [familyId, refetchMembers, refetchRels]);

  const [filterGender, setFilterGender] = useState<string>("all");
  const [hideInactive, setHideInactive] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [pendingConn, setPendingConn] = useState<{ source: string; target: string } | null>(null);
  const [relWizardOpen, setRelWizardOpen] = useState(false);
  const [newRelType, setNewRelType] = useState("father");
  const flowWrap = useRef<HTMLDivElement>(null);
  const exportJson = async () => {
    if (!familyId) return;
    try {
      const data = await callServer(exportFamilyTreeJson, { familyId });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `shajara-${familyId.slice(0,8)}-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("JSON eksport qilindi");
    } catch (e: any) { toast.error(e?.message ?? "Eksport xatolik"); }
  };


  const { initialNodes, initialEdges } = useMemo(() => {
    const filtered = members.filter((m: any) => {
      if (hideInactive && m.status !== "active") return false;
      if (filterGender !== "all" && m.gender !== filterGender) return false;
      return true;
    });
    const ids = new Set(filtered.map((m) => m.id));
    const nodes: Node[] = filtered.map((m: any) => ({
      id: m.id, type: "member", position: { x: 0, y: 0 },
      data: { ...m },
    }));
    const edges: Edge[] = [];
    const seen = new Set<string>();
    rels.forEach((r: any) => {
      if (!ids.has(r.member_id_1) || !ids.has(r.member_id_2)) return;
      const t = r.relationship_type;
      let src = r.member_id_1, tgt = r.member_id_2;
      let style: any = { stroke: "hsl(var(--muted-foreground))" };
      let animated = false;
      if (PARENT_REL.has(t)) { src = r.member_id_1; tgt = r.member_id_2; }
      else if (CHILD_REL.has(t)) { src = r.member_id_2; tgt = r.member_id_1; }
      else if (t === "husband" || t === "wife") {
        style = { stroke: "#ec4899", strokeDasharray: "4 2" };
      } else if (t === "brother" || t === "sister") {
        style = { stroke: "#10b981", strokeDasharray: "2 2" };
      }
      const key = [src, tgt, t].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({
        id: `${r.id}`, source: src, target: tgt,
        label: REL_LABELS[t] ?? t, animated,
        style, labelStyle: { fontSize: 10 },
        markerEnd: PARENT_REL.has(t) || CHILD_REL.has(t) ? { type: MarkerType.ArrowClosed } : undefined,
      });
    });
    return { initialNodes: layoutDagre(nodes, edges), initialEdges: edges };
  }, [members, rels, filterGender, hideInactive]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => { setNodes(initialNodes); setEdges(initialEdges); }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    setPendingConn({ source: c.source, target: c.target });
  }, []);

  const confirmAddRel = async () => {
    if (!pendingConn) return;
    try {
      await callServer(addRelationship, {
        familyId,
        memberId1: pendingConn.source,
        memberId2: pendingConn.target,
        relationshipType: newRelType,
      });
      toast.success("Aloqa qo'shildi");
      setPendingConn(null);
      reload();
    } catch (e: any) { toast.error(e?.message ?? "Xatolik yuz berdi"); }
  };

  const exportPng = async () => {
    const el = flowWrap.current?.querySelector(".react-flow__viewport") as HTMLElement | null;
    const root = flowWrap.current?.querySelector(".react-flow") as HTMLElement | null;
    if (!root) return;
    try {
      const dataUrl = await toPng(root, { backgroundColor: "#ffffff", pixelRatio: 2, filter: (n) => !(n as HTMLElement).classList?.contains?.("react-flow__minimap") && !(n as HTMLElement).classList?.contains?.("react-flow__controls") });
      const a = document.createElement("a");
      a.href = dataUrl; a.download = `shajara-${Date.now()}.png`; a.click();
    } catch { toast.error("Eksport qilib bo'lmadi"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Shajara daraxti</h1>
          <CacheStatus ts={Math.max(memTs ?? 0, relTs ?? 0) || null} stale={memStale || relStale} loading={(memLoading && !memRes) || (relLoading && !relRes)} onRefresh={reload} />
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={familyId} onValueChange={setFamilyId}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Oila" /></SelectTrigger>
            <SelectContent>{families.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filterGender} onValueChange={setFilterGender}>
            <SelectTrigger className="w-32 sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha jins</SelectItem>
              <SelectItem value="male">Erkak</SelectItem>
              <SelectItem value="female">Ayol</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={hideInactive} onCheckedChange={(v) => setHideInactive(!!v)} />
            Faqat faollar
          </label>
          <Button size="sm" onClick={() => setRelWizardOpen(true)}>+ Yangi aloqa</Button>
          <Button variant="outline" size="sm" onClick={exportPng}>PNG</Button>
          <Button variant="outline" size="sm" onClick={exportJson}>JSON</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
            <span className="font-semibold text-foreground">+ Yangi aloqa</span> tugmasini bosing yoki ikki node'ni bir-biriga torting. A'zoga bosing — profil ochiladi.
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4">
          <div ref={flowWrap} style={{ height: "min(70vh, 600px)" }} className="rounded-md border border-border bg-background">
            <ReactFlow
              nodes={nodes} edges={edges}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              onNodeClick={(_, n) => setSelected(n.data)}
              fitView minZoom={0.1} maxZoom={2}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{selected?.full_name}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              {selected.photo_url && <img src={selected.photo_url} alt="" className="h-24 w-24 rounded-full object-cover" />}
              <div><b>Status:</b> <Badge variant="outline">{selected.status}</Badge></div>
              {selected.gender && <div><b>Jins:</b> {selected.gender === "male" ? "Erkak" : "Ayol"}</div>}
              {selected.birth_date && <div><b>Tug'ilgan kun:</b> {selected.birth_date}</div>}
              {selected.phone && <div><b>Telefon:</b> {selected.phone}</div>}
              {selected.username && <div><b>Telegram:</b> @{selected.username}</div>}
              {selected.bio && <div className="whitespace-pre-wrap text-muted-foreground">{selected.bio}</div>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingConn} onOpenChange={(o) => !o && setPendingConn(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi aloqa qo'shish</DialogTitle>
          </DialogHeader>
          {pendingConn && (() => {
            const from = members.find((m) => m.id === pendingConn.source);
            const to = members.find((m) => m.id === pendingConn.target);
            const Avatar = ({ m }: { m: any }) => (
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                {m?.photo_url ? (
                  <img src={m.photo_url} alt="" className="h-14 w-14 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-base font-semibold border-2 border-border">
                    {(m?.full_name ?? "?").split(" ").map((s: string) => s[0]).slice(0,2).join("")}
                  </div>
                )}
                <div className="text-xs font-medium text-center truncate w-full">{m?.full_name}</div>
              </div>
            );
            return (
              <div className="space-y-5">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  <Avatar m={from} />
                  <div className="text-2xl text-muted-foreground shrink-0">→</div>
                  <Avatar m={to} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    <b>{from?.full_name?.split(" ")[0]}</b> kim bo'ladi <b>{to?.full_name?.split(" ")[0]}</b>ga?
                  </Label>
                  <Select value={newRelType} onValueChange={setNewRelType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {REL_TYPES.map((t) => <SelectItem key={t} value={t}>{REL_LABELS[t] ?? t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingConn(null)}>Bekor qilish</Button>
            <Button onClick={confirmAddRel}>Qo'shish</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
