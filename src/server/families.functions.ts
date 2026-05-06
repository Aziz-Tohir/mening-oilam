import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

// List families current user is part of (or owns)
export const listMyFamilies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: owned } = await supabase.from("families").select("id, name, telegram_group_id, telegram_group_title, owner_user_id, created_at").eq("owner_user_id", userId);
    const { data: roles } = await supabase.from("user_roles").select("family_id, role").eq("user_id", userId);
    const familyIds = Array.from(new Set([...(owned ?? []).map(f => f.id), ...(roles ?? []).map(r => r.family_id)]));
    if (familyIds.length === 0) return { families: [] };
    const { data: all } = await supabase.from("families").select("id, name, telegram_group_id, telegram_group_title, owner_user_id, created_at").in("id", familyIds);
    return { families: all ?? [] };
  });

const CreateFamilySchema = z.object({
  name: z.string().min(2).max(128),
  telegram_group_id: z.coerce.number().int().optional().nullable(),
  telegram_group_title: z.string().max(255).optional().nullable(),
  my_telegram_id: z.coerce.number().int().optional().nullable(),
  my_full_name: z.string().min(1).max(128),
});

// Create a new family. The creator becomes superadmin and a family_member.
export const createFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => CreateFamilySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = getAdminDb();

    const { data: family, error } = await admin.from("families").insert({
      name: data.name,
      telegram_group_id: data.telegram_group_id ?? null,
      telegram_group_title: data.telegram_group_title ?? null,
      owner_user_id: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // assign superadmin role
    await admin.from("user_roles").insert({
      user_id: userId, family_id: family.id, role: "superadmin",
    });

    // default settings
    await admin.from("family_settings").insert({ family_id: family.id });

    // create initial family_member linked to this user (if telegram id provided)
    if (data.my_telegram_id) {
      await admin.from("family_members").insert({
        family_id: family.id,
        telegram_id: data.my_telegram_id,
        full_name: data.my_full_name,
        status: "active",
        user_id: userId,
      });
    }

    await admin.from("action_logs").insert({
      family_id: family.id, actor_user_id: userId, action: "family_created",
      details: { name: data.name },
    });

    return { id: family.id };
  });

// Stats for dashboard
export const getFamilyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [members, requests, relationships] = await Promise.all([
      supabase.from("family_members").select("*", { count: "exact", head: true }).eq("family_id", data.familyId).eq("status", "active"),
      supabase.from("join_requests").select("*", { count: "exact", head: true }).eq("family_id", data.familyId).eq("status", "awaiting_admin_approval"),
      supabase.from("relationships").select("*", { count: "exact", head: true }).eq("family_id", data.familyId),
    ]);
    return {
      members: members.count ?? 0,
      pendingRequests: requests.count ?? 0,
      relationships: relationships.count ?? 0,
    };
  });

export const regenerateInviteCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const code = Array.from({ length: 8 }, () =>
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]
    ).join("");
    const { error } = await supabase.from("families").update({ invite_code: code } as never).eq("id", data.familyId);
    if (error) throw new Error(error.message);
    return { invite_code: code };
  });

export const getInviteInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: fam } = await supabase.from("families").select("invite_code").eq("id", data.familyId).maybeSingle();
    return { invite_code: (fam as any)?.invite_code ?? null, bot_username: process.env.BOT_USERNAME ?? null };
  });
