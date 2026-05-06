import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";
import { sendMessage, banChatMember, unbanChatMember, restrictChatMember } from "./telegram.server";

export const listBannedWords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("banned_words").select("*").eq("family_id", data.familyId).order("created_at", { ascending: false });
    return { items: rows ?? [] };
  });

export const addBannedWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    pattern: z.string().min(1).max(200),
    isRegex: z.boolean().default(false),
    action: z.enum(["delete","warn","kick"]).default("delete"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("banned_words").insert({
      family_id: data.familyId, pattern: data.pattern, is_regex: data.isRegex, action: data.action, created_by: context.userId,
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBannedWord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("banned_words").delete().eq("id", data.id).eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listWarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("member_warnings")
      .select("*, member:family_members!member_warnings_member_id_fkey(id, full_name, telegram_id)")
      .eq("family_id", data.familyId)
      .order("created_at", { ascending: false })
      .limit(100);
    return { items: rows ?? [] };
  });

export const addWarning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(), memberId: z.string().uuid(), reason: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: m } = await context.supabase.from("family_members").select("telegram_id, full_name").eq("id", data.memberId).maybeSingle();
    const { error } = await context.supabase.from("member_warnings").insert({
      family_id: data.familyId, member_id: data.memberId, telegram_id: m?.telegram_id,
      reason: data.reason, auto: false, issued_by_user_id: context.userId,
    } as any);
    if (error) throw new Error(error.message);
    if (m?.telegram_id) {
      try { await sendMessage(m.telegram_id, `⚠️ Sizga ogohlantirish berildi: ${data.reason}`); } catch {}
    }
    return { ok: true };
  });

export const clearWarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("member_warnings").delete().eq("family_id", data.familyId).eq("member_id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moderateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(), memberId: z.string().uuid(),
    action: z.enum(["kick","ban","mute_1h","mute_24h","unban"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: family } = await context.supabase.from("families").select("telegram_group_id").eq("id", data.familyId).maybeSingle();
    const { data: member } = await context.supabase.from("family_members").select("telegram_id, full_name").eq("id", data.memberId).maybeSingle();
    if (!family?.telegram_group_id) throw new Error("Oilaning Telegram guruhi sozlanmagan");
    if (!member?.telegram_id) throw new Error("A'zoning Telegram ID si yo'q");
    const chatId = family.telegram_group_id;
    const uid = member.telegram_id;
    try {
      if (data.action === "ban") await banChatMember(chatId, uid);
      else if (data.action === "kick") { await banChatMember(chatId, uid); await unbanChatMember(chatId, uid); }
      else if (data.action === "unban") await unbanChatMember(chatId, uid);
      else if (data.action === "mute_1h") await restrictChatMember(chatId, uid, Math.floor(Date.now()/1000) + 3600);
      else if (data.action === "mute_24h") await restrictChatMember(chatId, uid, Math.floor(Date.now()/1000) + 86400);
    } catch (e: any) {
      throw new Error(`Telegram xatolik: ${e.message}`);
    }
    await getAdminDb().from("action_logs").insert({
      family_id: data.familyId, actor_user_id: context.userId,
      action: `moderate_${data.action}`, details: { member_id: data.memberId, telegram_id: uid },
    });
    return { ok: true };
  });

export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    target: z.enum(["group","members"]),
    text: z.string().min(1).max(4000),
    genderFilter: z.enum(["all","male","female"]).default("all"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const db = getAdminDb();
    let recipients = 0, failures = 0;
    if (data.target === "group") {
      const { data: f } = await context.supabase.from("families").select("telegram_group_id").eq("id", data.familyId).maybeSingle();
      if (!f?.telegram_group_id) throw new Error("Guruh sozlanmagan");
      try { await sendMessage(f.telegram_group_id, data.text); recipients = 1; } catch { failures = 1; }
    } else {
      let q = context.supabase.from("family_members").select("telegram_id, gender").eq("family_id", data.familyId).eq("status", "active");
      if (data.genderFilter !== "all") q = q.eq("gender", data.genderFilter);
      const { data: members } = await q;
      for (const m of members ?? []) {
        if (!m.telegram_id) continue;
        try { await sendMessage(m.telegram_id, data.text); recipients++; }
        catch { failures++; }
      }
    }
    await db.from("bot_broadcasts").insert({
      family_id: data.familyId, target: data.target, message_text: data.text,
      sent_by_user_id: context.userId, recipients_count: recipients, failures_count: failures,
      gender_filter: data.genderFilter === "all" ? null : data.genderFilter,
    } as any);
    return { recipients, failures };
  });

export const listBroadcasts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("bot_broadcasts").select("*").eq("family_id", data.familyId).order("created_at", { ascending: false }).limit(50);
    return { items: rows ?? [] };
  });
