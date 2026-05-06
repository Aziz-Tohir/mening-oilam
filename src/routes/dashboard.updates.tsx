import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { listTelegramUpdates } from "@/server/debug.functions";

export const Route = createFileRoute("/dashboard/updates")({
  component: UpdatesPage,
});

type Row = {
  update_id: number;
  payload: any;
  created_at: string;
  processed_at: string | null;
  error: string | null;
};

function describeUpdate(p: any): { kind: string; from: string; chat: string; text: string } {
  if (!p || typeof p !== "object") return { kind: "—", from: "—", chat: "—", text: "—" };
  const msg = p.message ?? p.edited_message ?? p.channel_post ?? p.callback_query?.message;
  const cb = p.callback_query;
  const cm = p.chat_member ?? p.my_chat_member;
  let kind = "boshqa";
  if (p.message) kind = "xabar";
  else if (p.edited_message) kind = "tahrirlangan";
  else if (p.callback_query) kind = "tugma";
  else if (p.chat_member || p.my_chat_member) kind = "a'zolik";
  else if (p.channel_post) kind = "kanal";
  else if (p.inline_query) kind = "inline";

  const fromObj = cb?.from ?? msg?.from ?? cm?.from ?? p.from;
  const from = fromObj
    ? `${fromObj.first_name ?? ""}${fromObj.last_name ? " " + fromObj.last_name : ""}${fromObj.username ? " (@" + fromObj.username + ")" : ""} #${fromObj.id}`
    : "—";

  const chatObj = msg?.chat ?? cm?.chat;
  const chat = chatObj
    ? `${chatObj.title ?? chatObj.first_name ?? chatObj.username ?? "—"} [${chatObj.type}] #${chatObj.id}`
    : "—";

  let text = "";
  if (cb) text = `data=${cb.data}`;
  else if (msg?.text) text = msg.text;
  else if (msg?.caption) text = "🖼 " + msg.caption;
  else if (msg?.photo) text = "🖼 (rasm)";
  else if (msg?.video) text = "🎬 (video)";
  else if (msg?.document) text = "📄 " + (msg.document.file_name ?? "document");
  else if (msg?.voice) text = "🎤 (voice)";
  else if (msg?.sticker) text = "🌟 sticker " + (msg.sticker.emoji ?? "");
  else if (msg?.new_chat_members) text = "➕ qo'shildi: " + msg.new_chat_members.map((u: any) => u.first_name).join(", ");
  else if (msg?.left_chat_member) text = "➖ chiqdi: " + msg.left_chat_member.first_name;
  else if (cm) text = `status: ${cm.old_chat_member?.status} → ${cm.new_chat_member?.status}`;
  else text = "—";
  return { kind, from, chat, text: text.length > 120 ? text.slice(0, 120) + "…" : text };
}

function UpdatesPage() {
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState("");
  const [pendingSearch, setPendingSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);

  const cacheKey = `updates:${limit}:${onlyErrors}:${search}`;
  const { data, loading, ts, stale, refetch } = useCachedServer<{ rows: Row[]; stats: { total: number; errors: number; unprocessed: number } }>(
    cacheKey,
    listTelegramUpdates,
    { limit, onlyErrors, search: search || undefined },
    { staleMs: 1_800_000 },
  );

  const rows = data?.rows ?? [];
  const stats = data?.stats;

  const refresh = () => { invalidateCache("updates:"); refetch(); };

  const items = useMemo(() => rows.map((r) => ({ ...r, _info: describeUpdate(r.payload) })), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Telegram updates</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={refresh} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <>
              <Badge variant="secondary">Jami: {stats.total}</Badge>
              <Badge variant={stats.errors ? "destructive" : "secondary"}>Xato: {stats.errors}</Badge>
              <Badge variant="outline">Qayta ishlanmagan: {stats.unprocessed}</Badge>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Filtrlar</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyErrors} onCheckedChange={setOnlyErrors} />
              Faqat xatolar
            </label>
            <select
              className="h-9 rounded border border-border bg-background px-2 text-sm"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
            >
              {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n} ta</option>)}
            </select>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); setSearch(pendingSearch.trim()); }}
            >
              <Input
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                placeholder="Qidirish (matn, ID, xato)…"
                className="h-9 w-56"
              />
              <Button size="sm" type="submit" variant="outline">Qidir</Button>
              {search && (
                <Button size="sm" type="button" variant="ghost" onClick={() => { setSearch(""); setPendingSearch(""); }}>
                  Tozalash
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3">Vaqt</th>
                <th className="p-3">ID</th>
                <th className="p-3">Tur</th>
                <th className="p-3">Kim</th>
                <th className="p-3">Qayerda</th>
                <th className="p-3">Mazmun</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Yuklanmoqda…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Hech narsa topilmadi</td></tr>
              )}
              {items.map((r) => (
                <tr
                  key={r.update_id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <td className="p-3 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("uz-UZ", { dateStyle: "short", timeStyle: "medium" })}
                  </td>
                  <td className="p-3 font-mono text-xs">{r.update_id}</td>
                  <td className="p-3"><Badge variant="outline">{r._info.kind}</Badge></td>
                  <td className="p-3 text-xs">{r._info.from}</td>
                  <td className="p-3 text-xs">{r._info.chat}</td>
                  <td className="p-3 max-w-[320px] truncate">{r._info.text}</td>
                  <td className="p-3">
                    {r.error
                      ? <Badge variant="destructive">xato</Badge>
                      : r.processed_at
                        ? <Badge>OK</Badge>
                        : <Badge variant="secondary">kutmoqda</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update #{selected?.update_id}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><b>Yaratilgan:</b> {new Date(selected.created_at).toLocaleString("uz-UZ")}</div>
                <div><b>Qayta ishlangan:</b> {selected.processed_at ? new Date(selected.processed_at).toLocaleString("uz-UZ") : "—"}</div>
                <div><b>Tur:</b> {describeUpdate(selected.payload).kind}</div>
                <div><b>Status:</b> {selected.error ? "xato" : selected.processed_at ? "OK" : "kutmoqda"}</div>
              </div>
              {selected.error && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-destructive">
                  <b>Xato:</b>
                  <pre className="mt-1 whitespace-pre-wrap text-xs">{selected.error}</pre>
                </div>
              )}
              <div>
                <b>Payload (JSON):</b>
                <pre className="mt-1 max-h-[60vh] overflow-auto rounded border border-border bg-muted/40 p-3 text-xs">
{JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
