import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

async function assertSuperadmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Faqat superadmin uchun");
}

export const listAllFamilies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const db = getAdminDb();
    const { data: fams, error } = await db
      .from("families")
      .select("id, name, owner_user_id, telegram_group_id, telegram_group_title, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (fams ?? []).map((f: any) => f.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: members } = await db
        .from("family_members")
        .select("family_id")
        .in("family_id", ids);
      for (const m of (members ?? []) as any[]) {
        counts[m.family_id] = (counts[m.family_id] ?? 0) + 1;
      }
    }

    // Owner emails (best-effort via profiles)
    const ownerIds = Array.from(new Set((fams ?? []).map((f: any) => f.owner_user_id).filter(Boolean)));
    const owners: Record<string, { email: string | null; display_name: string | null }> = {};
    if (ownerIds.length) {
      const { data: profs } = await db
        .from("profiles")
        .select("user_id, email, display_name")
        .in("user_id", ownerIds);
      for (const p of (profs ?? []) as any[]) {
        owners[p.user_id] = { email: p.email, display_name: p.display_name };
      }
    }

    return {
      families: (fams ?? []).map((f: any) => ({
        ...f,
        members_count: counts[f.id] ?? 0,
        owner: owners[f.owner_user_id] ?? null,
      })),
    };
  });

export const updateFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      familyId: z.string().uuid(),
      patch: z.object({
        name: z.string().min(2).max(128).optional(),
        telegram_group_id: z.coerce.number().int().nullable().optional(),
        telegram_group_title: z.string().max(255).nullable().optional(),
      }),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const db = getAdminDb();
    const { error } = await db.from("families").update(data.patch as never).eq("id", data.familyId);
    if (error) throw new Error(error.message);
    await db.from("action_logs").insert({
      family_id: data.familyId,
      actor_user_id: context.userId,
      action: "family_updated_by_superadmin",
      details: { fields: Object.keys(data.patch) },
    });
    return { ok: true };
  });

export const deleteFamily = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const db = getAdminDb();
    const fid = data.familyId;
    // Cascade delete in safe order (no FKs in schema, so manual)
    const tables = [
      "admin_notifications",
      "action_logs",
      "notification_log",
      "bot_broadcasts",
      "birthday_greetings",
      "banned_words",
      "member_warnings",
      "messages_stats",
      "bot_integrations",
      "join_requests",
      "nominations",
      "memories",
      "event_rsvps",
      "events",
      "relationships",
      "user_roles",
      "family_members",
      "family_settings",
    ];
    for (const t of tables) {
      await db.from(t as any).delete().eq("family_id", fid);
    }
    const { error } = await db.from("families").delete().eq("id", fid);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const transferFamilyOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      familyId: z.string().uuid(),
      newOwnerUserId: z.string().uuid(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context.supabase, context.userId);
    const db = getAdminDb();
    const { error } = await db
      .from("families")
      .update({ owner_user_id: data.newOwnerUserId } as never)
      .eq("id", data.familyId);
    if (error) throw new Error(error.message);

    // Ensure new owner has superadmin role for this family
    const { data: existing } = await db
      .from("user_roles")
      .select("id, role")
      .eq("user_id", data.newOwnerUserId)
      .eq("family_id", data.familyId)
      .maybeSingle();
    if (!existing) {
      await db.from("user_roles").insert({
        user_id: data.newOwnerUserId,
        family_id: data.familyId,
        role: "superadmin",
      });
    } else if ((existing as any).role !== "superadmin") {
      await db.from("user_roles").update({ role: "superadmin" } as never).eq("id", (existing as any).id);
    }

    await db.from("action_logs").insert({
      family_id: data.familyId,
      actor_user_id: context.userId,
      action: "family_ownership_transferred",
      details: { new_owner: data.newOwnerUserId },
    });
    return { ok: true };
  });
