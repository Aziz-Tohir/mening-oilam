// Annual awards cron — runs Jan 1, computes nominations from prior year stats.
// Protected by ?secret= matching CRON_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { getAdminDb } from "@/server/db.server";
import { sendMessage } from "@/server/telegram.server";

async function processFamily(db: ReturnType<typeof getAdminDb>, family: any, year: number) {
  // Most active by message count
  const { data: stats } = await db.from("messages_stats")
    .select("member_id, telegram_id, messages_count, sentiment_score")
    .eq("family_id", family.id)
    .gte("message_date", `${year}-01-01`).lte("message_date", `${year}-12-31`);
  const byMember = new Map<string, { count: number; sentSum: number; sentN: number; tg: number }>();
  for (const s of stats ?? []) {
    const k = s.member_id ?? `tg:${s.telegram_id}`;
    if (!k) continue;
    const cur = byMember.get(k) ?? { count: 0, sentSum: 0, sentN: 0, tg: s.telegram_id ?? 0 };
    cur.count += s.messages_count ?? 0;
    if (s.sentiment_score != null) { cur.sentSum += Number(s.sentiment_score); cur.sentN += 1; }
    byMember.set(k, cur);
  }

  const memberRows: { key: string; member_id: string | null; tg: number; count: number; avgSent: number | null }[] = [];
  for (const [k, v] of byMember) {
    memberRows.push({
      key: k,
      member_id: k.startsWith("tg:") ? null : k,
      tg: v.tg, count: v.count,
      avgSent: v.sentN ? v.sentSum / v.sentN : null,
    });
  }

  async function nameFor(member_id: string | null, tg: number): Promise<string> {
    if (member_id) {
      const { data: m } = await db.from("family_members").select("full_name").eq("id", member_id).maybeSingle();
      if (m?.full_name) return m.full_name;
    }
    if (tg) {
      const { data: m } = await db.from("family_members").select("full_name").eq("telegram_id", tg).eq("family_id", family.id).maybeSingle();
      if (m?.full_name) return m.full_name;
    }
    return "Noma'lum";
  }

  const noms: { category: string; member_id: string | null; member_name: string; metric_value: number }[] = [];

  // Eng faol
  if (memberRows.length) {
    const top = [...memberRows].sort((a, b) => b.count - a.count)[0];
    noms.push({ category: "Eng faol a'zo", member_id: top.member_id, member_name: await nameFor(top.member_id, top.tg), metric_value: top.count });
  }

  // Yil quvonchi (eng yuqori sentiment)
  const sentRows = memberRows.filter(r => r.avgSent != null && r.count >= 5);
  if (sentRows.length) {
    const joy = [...sentRows].sort((a, b) => (b.avgSent! - a.avgSent!))[0];
    noms.push({ category: "Yil quvonchi", member_id: joy.member_id, member_name: await nameFor(joy.member_id, joy.tg), metric_value: Number(joy.avgSent!.toFixed(3)) });
  }

  // Eng ko'p tabriklagan
  const { data: greets } = await db.from("birthday_greetings")
    .select("greeter_telegram_id, greeter_name")
    .eq("family_id", family.id).eq("greeting_year", year);
  const grCount = new Map<number, { name: string; n: number }>();
  for (const g of greets ?? []) {
    const cur = grCount.get(g.greeter_telegram_id) ?? { name: g.greeter_name ?? "—", n: 0 };
    cur.n += 1; grCount.set(g.greeter_telegram_id, cur);
  }
  if (grCount.size) {
    const [tg, info] = [...grCount.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    const { data: m } = await db.from("family_members").select("id, full_name").eq("family_id", family.id).eq("telegram_id", tg).maybeSingle();
    noms.push({ category: "Eng ko'p tabriklagan", member_id: m?.id ?? null, member_name: m?.full_name ?? info.name, metric_value: info.n });
  }

  // Save
  for (const n of noms) {
    await db.from("nominations").upsert({
      family_id: family.id, year, category: n.category,
      member_id: n.member_id, member_name: n.member_name, metric_value: n.metric_value,
    } as any, { onConflict: "family_id,year,category" });
  }

  // Group announcement
  if (family.telegram_group_id && noms.length) {
    const lines = [`🏆 *${year}-yil mukofotlari* 🏆`, ""];
    for (const n of noms) lines.push(`• *${n.category}*: ${n.member_name} _(${n.metric_value})_`);
    try { await sendMessage(family.telegram_group_id, lines.join("\n"), { parse_mode: "Markdown" }); } catch (e) { console.error("awards announce", e); }
  }

  return noms.length;
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const yearParam = url.searchParams.get("year");
  const year = yearParam ? Number(yearParam) : new Date().getFullYear() - 1;

  const db = getAdminDb();
  const { data: families } = await db.from("families").select("id, name, telegram_group_id");
  let total = 0;
  for (const fam of families ?? []) {
    try { total += await processFamily(db, fam, year); }
    catch (e) { console.error("awards family err", fam.id, e); }
  }
  return Response.json({ ok: true, year, families: families?.length ?? 0, awards: total });
}

export const Route = createFileRoute("/api/public/cron/annual-awards")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
