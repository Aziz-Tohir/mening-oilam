import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getFamilyMessageStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), days: z.number().int().min(1).max(365).default(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceISO = since.toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .from("messages_stats")
      .select("telegram_id, member_id, message_date, messages_count")
      .eq("family_id", data.familyId)
      .gte("message_date", sinceISO);
    if (error) throw new Error(error.message);

    const { data: members } = await supabase
      .from("family_members")
      .select("id, full_name, telegram_id")
      .eq("family_id", data.familyId);
    const byTg = new Map<number, { full_name: string }>();
    for (const m of members ?? []) if (m.telegram_id) byTg.set(Number(m.telegram_id), { full_name: m.full_name });

    // Aggregate per user
    const perUser = new Map<string, { name: string; total: number; telegram_id: number | null }>();
    const perDay = new Map<string, number>();
    let total = 0;
    for (const r of rows ?? []) {
      const tg = r.telegram_id ? Number(r.telegram_id) : null;
      const key = tg ? `tg:${tg}` : `m:${r.member_id ?? "x"}`;
      const name = (tg && byTg.get(tg)?.full_name) || "Noma'lum";
      const cur = perUser.get(key) ?? { name, total: 0, telegram_id: tg };
      cur.total += r.messages_count;
      perUser.set(key, cur);
      perDay.set(r.message_date, (perDay.get(r.message_date) ?? 0) + r.messages_count);
      total += r.messages_count;
    }
    const top = Array.from(perUser.values()).sort((a, b) => b.total - a.total).slice(0, 20);
    const trend = Array.from(perDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
    return { top, trend, total };
  });
