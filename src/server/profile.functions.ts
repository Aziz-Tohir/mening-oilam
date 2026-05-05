import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("family_members")
      .select("id, family_id, full_name, birth_date, gender, phone, bio, photo_url, photo_is_private, username, telegram_id, status, families:family_id(id, name)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { memberships: data ?? [] };
  });

const PatchSchema = z.object({
  full_name: z.string().trim().min(1).max(128).optional(),
  birth_date: z.string().nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  photo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  photo_is_private: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    memberId: z.string().uuid(),
    patch: PatchSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS guarantees only own record; double-check user_id match
    const { error } = await supabase
      .from("family_members")
      .update(data.patch as never)
      .eq("id", data.memberId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
