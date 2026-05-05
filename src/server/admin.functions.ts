import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("family_members")
      .select("*")
      .eq("family_id", data.familyId)
      .order("joined_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { members: members ?? [] };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    memberId: z.string().uuid(),
    status: z.enum(["active","blocked","pending"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("family_members")
      .update({ status: data.status })
      .eq("id", data.memberId)
      .eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    await getAdminDb().from("action_logs").insert({
      family_id: data.familyId, actor_user_id: userId,
      action: "member_status_changed",
      details: { member_id: data.memberId, status: data.status },
    });
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    memberId: z.string().uuid(),
    patch: z.object({
      birth_date: z.string().nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
      bio: z.string().max(1000).nullable().optional(),
      full_name: z.string().min(1).max(128).optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("family_members")
      .update(data.patch as never)
      .eq("id", data.memberId)
      .eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listJoinRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("join_requests")
      .select("*")
      .eq("family_id", data.familyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { requests: rows ?? [] };
  });

export const listRelationships = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("relationships")
      .select("*, m1:family_members!relationships_member_id_1_fkey(id, full_name), m2:family_members!relationships_member_id_2_fkey(id, full_name)")
      .eq("family_id", data.familyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { relationships: rows ?? [] };
  });

export const addRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    memberId1: z.string().uuid(),
    memberId2: z.string().uuid(),
    relationshipType: z.string().min(1).max(64),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("relationships").insert({
      family_id: data.familyId,
      member_id_1: data.memberId1,
      member_id_2: data.memberId2,
      relationship_type: data.relationshipType as any,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("relationships").delete().eq("id", data.id).eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("family_settings").select("*").eq("family_id", data.familyId).maybeSingle();
    return { settings: row };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    patch: z.record(z.string(), z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("family_settings").update(data.patch as never).eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listBotIntegrations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase.from("bot_integrations").select("*").eq("family_id", data.familyId);
    return { items: rows ?? [] };
  });

export const upsertBotIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    botUsername: z.string().min(3).max(64).regex(/^[A-Za-z0-9_]+$/),
    mode: z.enum(["media_only","delete_all","keep_all"]),
    isActive: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("bot_integrations").upsert({
      family_id: data.familyId,
      bot_username: data.botUsername,
      mode: data.mode,
      is_active: data.isActive,
      added_by: userId,
    }, { onConflict: "family_id,bot_username" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), limit: z.number().min(1).max(200).default(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows } = await supabase.from("action_logs").select("*").eq("family_id", data.familyId).order("created_at", { ascending: false }).limit(data.limit);
    return { logs: rows ?? [] };
  });
