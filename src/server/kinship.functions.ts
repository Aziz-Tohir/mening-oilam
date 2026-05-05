import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateKinship, type EdgeRow } from "@/lib/kinship";

export const computeKinship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    fromMemberId: z.string().uuid(),
    toMemberId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: edges, error } = await supabase
      .from("relationships")
      .select("member_id_1, member_id_2, relationship_type")
      .eq("family_id", data.familyId);
    if (error) throw new Error(error.message);

    const [{ data: from }, { data: to }] = await Promise.all([
      supabase.from("family_members").select("id, full_name").eq("id", data.fromMemberId).maybeSingle(),
      supabase.from("family_members").select("id, full_name").eq("id", data.toMemberId).maybeSingle(),
    ]);
    if (!from || !to) throw new Error("A'zo topilmadi");

    const result = calculateKinship((edges ?? []) as EdgeRow[], data.fromMemberId, data.toMemberId);
    return {
      from: from.full_name,
      to: to.full_name,
      ...result,
    };
  });
