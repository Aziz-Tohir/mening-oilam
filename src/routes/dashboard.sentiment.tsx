import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMyFamilies } from "@/server/families.functions";
import { getSentimentTrend } from "@/server/sentiment.functions";
import { useCachedServer, invalidateCache } from "@/lib/serverCall";
import { CacheStatus } from "@/components/CacheStatus";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/dashboard/sentiment")({
  component: SentimentPage,
});

type Row = { message_date: string; sentiment_score: number; member_id: string | null; telegram_id: number | null; messages_count: number };
type Member = { id: string; telegram_id: number | null; full_name: string; sentiment_opt_out: boolean };

function colorFor(v: number | null): string {
  if (v == null || isNaN(v)) return "hsl(var(--muted))";
  // -1 red → 0 yellow → +1 green
  const t = (v + 1) / 2; // 0..1
  const hue = Math.round(t * 130); // 0=red, 130=green
  return `hsl(${hue} 70% 55%)`;
}

function SentimentPage() {
  const { data: famRes } = useCachedServer<{ families: any[] }>("families:mine", listMyFamilies);
  const families = famRes?.families ?? [];
  const [familyId, setFamilyId] = useState<string>("");
  const [days, setDays] = useState<number>(90);
  useEffect(() => { if (!familyId && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const { data, ts, stale, loading, refetch } = useCachedServer<{ rows: Row[]; members: Member[] }>(
    `sentiment:${familyId}:${days}`, getSentimentTrend, { familyId, days }, { enabled: !!familyId },
  );
  const reload = () => { invalidateCache(`sentiment:${familyId}:${days}`); refetch(); };

  const rows = data?.rows ?? [];
  const members = data?.members ?? [];

  const memberName = (r: Row): string => {
    const byMember = r.member_id && members.find(m => m.id === r.member_id);
    const byTg = !byMember && r.telegram_id != null ? members.find(m => m.telegram_id === r.telegram_id) : null;
    const m = byMember || byTg;
    if (!m) return "Noma'lum";
    return m.sentiment_opt_out ? "Maxfiy" : m.full_name;
  };

  // Daily aggregate (weighted by messages_count)
  const trend = useMemo(() => {
    const m = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const cur = m.get(r.message_date) ?? { sum: 0, n: 0 };
      const w = Math.max(1, r.messages_count);
      cur.sum += r.sentiment_score * w;
      cur.n += w;
      m.set(r.message_date, cur);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date: date.slice(5), avg: Number((v.sum / v.n).toFixed(3)) }));
  }, [rows]);

  // Per-member 30-day avg
  const perMember = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const m = new Map<string, { name: string; sum: number; n: number }>();
    for (const r of rows) {
      if (r.message_date < cutoff) continue;
      const key = r.member_id ?? `tg:${r.telegram_id}`;
      const cur = m.get(key) ?? { name: memberName(r), sum: 0, n: 0 };
      const w = Math.max(1, r.messages_count);
      cur.sum += r.sentiment_score * w;
      cur.n += w;
      m.set(key, cur);
    }
    return [...m.values()]
      .map(x => ({ name: x.name, avg: Number((x.sum / x.n).toFixed(3)) }))
      .sort((a, b) => b.avg - a.avg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, members]);

  // Cards
  const todayISO = new Date().toISOString().slice(0, 10);
  const card = (label: string, predicate: (date: string) => boolean) => {
    let sum = 0, n = 0;
    for (const r of rows) {
      if (!predicate(r.message_date)) continue;
      const w = Math.max(1, r.messages_count);
      sum += r.sentiment_score * w; n += w;
    }
    const v = n ? sum / n : null;
    return { label, value: v };
  };
  const cards = [
    card("Bugun", d => d === todayISO),
    card("Oxirgi 7 kun", d => d >= new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)),
    card("Oxirgi 30 kun", d => d >= new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)),
  ];

  // Year's joy (highest 30-day avg with >= 3 days of data)
  const yearJoy = useMemo(() => {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const m = new Map<string, { name: string; sum: number; n: number; days: Set<string> }>();
    for (const r of rows) {
      if (r.message_date < cutoff) continue;
      const key = r.member_id ?? `tg:${r.telegram_id}`;
      const cur = m.get(key) ?? { name: memberName(r), sum: 0, n: 0, days: new Set() };
      const w = Math.max(1, r.messages_count);
      cur.sum += r.sentiment_score * w; cur.n += w; cur.days.add(r.message_date);
      m.set(key, cur);
    }
    const eligible = [...m.values()].filter(x => x.days.size >= 3);
    if (!eligible.length) return null;
    return eligible.map(x => ({ name: x.name, avg: x.sum / x.n })).sort((a, b) => b.avg - a.avg)[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, members]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">😊 Ruhiy holat tahlili</h1>
          <CacheStatus ts={ts} stale={stale} loading={loading && !data} onRefresh={reload} />
        </div>
        <div className="flex gap-2">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 kun</SelectItem>
              <SelectItem value="90">90 kun</SelectItem>
              <SelectItem value="180">180 kun</SelectItem>
              <SelectItem value="365">1 yil</SelectItem>
            </SelectContent>
          </Select>
          <Select value={familyId} onValueChange={setFamilyId}>
            <SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>{families.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        🔒 Maxfiylik: xabar matni saqlanmaydi, faqat agregat raqam (-1..1). Kuniga 3 dan kam xabar yozgan a'zolar tahlil qilinmaydi.
        A'zolar Telegram'da <code>/privacy</code> orqali tahlildan voz kechishlari mumkin.
      </p>

      {!data ? <p className="mt-6 text-muted-foreground">Yuklanmoqda…</p> : rows.length === 0 ? (
        <Card className="mt-6"><CardContent className="py-10 text-center text-muted-foreground">
          Hali tahlil ma'lumotlari yo'q. Cron ertasi kuni 02:00 da ishga tushadi.
        </CardContent></Card>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {cards.map(c => (
              <Card key={c.label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{c.label}</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold" style={{ color: colorFor(c.value) }}>
                    {c.value == null ? "—" : c.value > 0 ? `+${c.value.toFixed(2)}` : c.value.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {yearJoy && (
            <Card>
              <CardHeader><CardTitle>🏆 Quvonch yetakchisi (oxirgi 30 kun)</CardTitle></CardHeader>
              <CardContent>
                <p className="text-lg"><b>{yearJoy.name}</b> — o'rtacha {yearJoy.avg > 0 ? "+" : ""}{yearJoy.avg.toFixed(2)}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Kunlik trend</CardTitle></CardHeader>
            <CardContent style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" />
                  <YAxis domain={[-1, 1]} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" />
                  <Line type="monotone" dataKey="avg" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>A'zolar bo'yicha (oxirgi 30 kun avg)</CardTitle></CardHeader>
            <CardContent style={{ width: "100%", height: Math.max(220, perMember.length * 32 + 40) }}>
              <ResponsiveContainer>
                <BarChart data={perMember} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" domain={[-1, 1]} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip />
                  <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
