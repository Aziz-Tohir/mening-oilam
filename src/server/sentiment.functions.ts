import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSentimentTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    days: z.number().int().min(7).max(365).default(90),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString().slice(0, 10);
    const { data: rows, error } = await supabase
      .from("messages_stats")
      .select("message_date, sentiment_score, member_id, telegram_id, messages_count")
      .eq("family_id", data.familyId)
      .gte("message_date", since)
      .not("sentiment_score", "is", null);
    if (error) throw new Error(error.message);

    // Names for members in this family (admins/members can see; RLS enforces)
    const { data: members } = await supabase
      .from("family_members")
      .select("id, telegram_id, full_name, sentiment_opt_out")
      .eq("family_id", data.familyId);

    return { rows: rows ?? [], members: members ?? [] };
  });

export const setSentimentOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    memberId: z.string().uuid(),
    optOut: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("family_members")
      .update({ sentiment_opt_out: data.optOut } as never)
      .eq("id", data.memberId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
