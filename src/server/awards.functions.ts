import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNominations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    year: z.number().int().min(2000).max(3000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("nominations").select("*").eq("family_id", data.familyId).order("year", { ascending: false });
    if (data.year) q = q.eq("year", data.year);
    const { data: rows } = await q;
    return { nominations: rows ?? [] };
  });

export const listMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    year: z.number().int().min(2000).max(3000).optional(),
    limit: z.number().int().min(1).max(200).default(60),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase.from("memories").select("*").eq("family_id", data.familyId)
      .order("created_at", { ascending: false }).limit(data.limit);
    if (data.year) q = q.eq("message_year", data.year);
    const { data: rows } = await q;
    return { memories: rows ?? [] };
  });
