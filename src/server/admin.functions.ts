import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";
import { postLog } from "./logChannel.server";

async function assertCanManageFamily(userId: string, familyId: string) {
  const db = getAdminDb();
  const { data, error } = await db
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .or(`family_id.eq.${familyId},family_id.is.null`)
    .in("role", ["admin", "superadmin"])
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Bu oila sozlamalarini boshqarish huquqi yo'q");
}

export const listMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: members, error } = await supabase
      .from("family_members")
      .select("*")
      .eq("family_id", data.familyId)
      .order("joined_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Apply female photo visibility policy
    const { data: settings } = await supabase
      .from("family_settings")
      .select("female_photo_visibility")
      .eq("family_id", data.familyId)
      .maybeSingle();
    const policy = (settings as any)?.female_photo_visibility ?? "public";

    let viewerIsFemale = false;
    const viewer = (members ?? []).find((m: any) => m.user_id === userId);
    if (viewer) viewerIsFemale = viewer.gender === "female";

    const filtered = (members ?? []).map((m: any) => {
      if (m.gender !== "female" || !m.photo_url) return m;
      if (m.user_id === userId) return m; // owner always sees own
      let hide = false;
      if (policy === "always_hidden") hide = true;
      else if (policy === "female_only" && !viewerIsFemale) hide = true;
      else if (policy === "private_default" && m.photo_is_private) hide = true;
      else if (policy === "public" && m.photo_is_private) hide = true;
      return hide ? { ...m, photo_url: null, photo_hidden: true } : m;
    });

    return { members: filtered };
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
    await postLog(data.familyId, "actions", `👤 A'zo statusi: <code>${data.memberId}</code> → <b>${data.status}</b>`);
    return { ok: true };
  });

export const updateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    memberId: z.string().uuid(),
    patch: z.object({
      full_name: z.string().min(1).max(128).optional(),
      birth_date: z.string().nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
      bio: z.string().max(1000).nullable().optional(),
      gender: z.enum(["male", "female"]).nullable().optional(),
      photo_url: z.string().nullable().optional(),
      photo_is_private: z.boolean().optional(),
      status: z.enum(["active", "blocked", "pending"]).optional(),
      username: z.string().max(64).nullable().optional(),
      relationship_to_inviter: z.string().max(64).nullable().optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("family_members")
      .update(data.patch as never)
      .eq("id", data.memberId)
      .eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    await getAdminDb().from("action_logs").insert({
      family_id: data.familyId,
      actor_user_id: userId,
      action: "member_updated",
      details: { member_id: data.memberId, fields: Object.keys(data.patch) },
    });
    await postLog(
      data.familyId,
      "actions",
      `✏️ A'zo tahrirlandi: <code>${data.memberId}</code>\nMaydonlar: ${Object.keys(data.patch).join(", ")}`,
    );
    return { ok: true };
  });

export const addMemberManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    full_name: z.string().min(2).max(128),
    telegram_id: z.coerce.number().int().positive(),
    username: z.string().max(64).optional().nullable(),
    gender: z.enum(["male", "female"]).optional().nullable(),
    birth_date: z.string().optional().nullable(),
    phone: z.string().max(32).optional().nullable(),
    relationship_to_inviter: z.string().max(64).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageFamily(context.userId, data.familyId);
    const db = getAdminDb();
    // Reject if telegram_id already in this family
    const { data: existing } = await db.from("family_members")
      .select("id").eq("family_id", data.familyId).eq("telegram_id", data.telegram_id).maybeSingle();
    if (existing) throw new Error("Bu Telegram ID allaqachon oilada mavjud");

    const { data: inserted, error } = await db.from("family_members").insert({
      family_id: data.familyId,
      telegram_id: data.telegram_id,
      full_name: data.full_name,
      username: data.username ?? null,
      gender: (data.gender ?? null) as any,
      birth_date: data.birth_date || null,
      phone: data.phone || null,
      relationship_to_inviter: (data.relationship_to_inviter ?? null) as any,
      status: "active",
      invited_by: context.userId,
    } as any).select("id").single();
    if (error) throw new Error(error.message);

    await db.from("action_logs").insert({
      family_id: data.familyId, actor_user_id: context.userId,
      action: "member_added_manually",
      details: { member_id: inserted!.id, telegram_id: data.telegram_id, full_name: data.full_name },
    });
    return { id: inserted!.id };
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
    if (error) {
      if ((error as any).code === "23505" || /duplicate key/i.test(error.message)) {
        throw new Error("Bu aloqa allaqachon mavjud");
      }
      throw new Error(error.message);
    }
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
    await assertCanManageFamily(context.userId, data.familyId);
    const db = getAdminDb();
    const { data: row, error } = await db.from("family_settings").select("*").eq("family_id", data.familyId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      const { data: created, error: createError } = await db.from("family_settings").insert({ family_id: data.familyId }).select("*").single();
      if (createError) throw new Error(createError.message);
      return { settings: created };
    }
    return { settings: row };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    patch: z.record(z.string(), z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertCanManageFamily(context.userId, data.familyId);
    const db = getAdminDb();
    const { error } = await db.from("family_settings").update(data.patch as never).eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    const { invalidateCache } = await import("./cache.server");
    invalidateCache(`settings:${data.familyId}`);
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
