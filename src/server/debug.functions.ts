import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "superadmin"])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Faqat adminlar uchun");
}

export const listTelegramUpdates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      limit: z.number().int().min(1).max(200).default(50),
      onlyErrors: z.boolean().default(false),
      search: z.string().trim().max(200).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const db = getAdminDb();
    let q = db
      .from("telegram_updates_raw")
      .select("update_id, payload, created_at, processed_at, error")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.onlyErrors) q = q.not("error", "is", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    let filtered = rows ?? [];
    if (data.search) {
      const s = data.search.toLowerCase();
      filtered = filtered.filter((r: any) =>
        JSON.stringify(r.payload ?? {}).toLowerCase().includes(s) ||
        String(r.update_id).includes(s) ||
        (r.error ?? "").toLowerCase().includes(s),
      );
    }

    // Fetch counts
    const { count: total } = await db
      .from("telegram_updates_raw")
      .select("update_id", { count: "exact", head: true });
    const { count: errCount } = await db
      .from("telegram_updates_raw")
      .select("update_id", { count: "exact", head: true })
      .not("error", "is", null);
    const { count: unprocessed } = await db
      .from("telegram_updates_raw")
      .select("update_id", { count: "exact", head: true })
      .is("processed_at", null);

    return {
      rows: filtered,
      stats: { total: total ?? 0, errors: errCount ?? 0, unprocessed: unprocessed ?? 0 },
    };
  });
