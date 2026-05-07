// Group message moderation logic
import { getAdminDb } from "./db.server";
import { deleteMessage, sendMessage, banChatMember, restrictChatMember } from "./telegram.server";
import { postLog } from "./logChannel.server";

const URL_REGEX = /(https?:\/\/[^\s]+|t\.me\/[^\s]+|@[A-Za-z0-9_]{4,})/i;

type Msg = {
  message_id: number;
  from?: { id: number; first_name?: string; username?: string };
  chat: { id: number };
  text?: string;
  caption?: string;
  forward_from?: any;
  forward_from_chat?: any;
  forward_origin?: any;
};

const lastMsgAt = new Map<string, number>();

export async function moderateGroupMessage(msg: Msg, family: { id: string; telegram_group_id: number }) {
  const db = getAdminDb();
  const userId = msg.from?.id;
  if (!userId) return false;

  const { getFamilySettings, getBannedWords } = await import("./cache.server");
  const settings = await getFamilySettings(family.id);
  if (!settings) return false;

  const text = (msg.text ?? msg.caption ?? "").toString();
  let violation: string | null = null;
  let action: "delete" | "warn" | "kick" = "delete";

  if (settings.anti_forward && (msg.forward_from || msg.forward_from_chat || msg.forward_origin)) {
    violation = "Forward xabarlar taqiqlangan"; action = "delete";
  }
  if (!violation && settings.anti_link && URL_REGEX.test(text)) {
    const allowed: string[] = settings.allowed_link_domains ?? [];
    const ok = allowed.some(d => text.toLowerCase().includes(d.toLowerCase()));
    if (!ok) { violation = "Havolalar taqiqlangan"; action = "warn"; }
  }
  if (!violation && settings.anti_flood_seconds > 0) {
    const key = `${msg.chat.id}:${userId}`;
    const now = Date.now();
    const last = lastMsgAt.get(key) ?? 0;
    if (now - last < settings.anti_flood_seconds * 1000) {
      violation = "Tez-tez yozyapsiz (flood)"; action = "delete";
    }
    lastMsgAt.set(key, now);
  }
  if (!violation && text) {
    const words = await getBannedWords(family.id);
    for (const w of words) {
      try {
        const re = w.is_regex ? new RegExp(w.pattern, "i") : new RegExp(escapeRegex(w.pattern), "i");
        if (re.test(text)) {
          violation = `Taqiqlangan so'z: ${w.pattern}`;
          action = (w.action ?? "delete") as any;
          break;
        }
      } catch {}
    }
  }

  if (!violation) return false;

  await deleteMessage(msg.chat.id, msg.message_id);

  // Build a clickable mention for the offender
  const mentionName = escapeHtml(msg.from?.first_name || msg.from?.username || `id${userId}`);
  const mention = `<a href="tg://user?id=${userId}">${mentionName}</a>`;

  if (action === "warn" || action === "kick") {
    const { data: member } = await db.from("family_members")
      .select("id, full_name").eq("family_id", family.id).eq("telegram_id", userId).maybeSingle();
    const memberId = member?.id;
    if (memberId) {
      await db.from("member_warnings").insert({
        family_id: family.id, member_id: memberId, telegram_id: userId, reason: violation, auto: true,
      });
      const { count } = await db.from("member_warnings").select("*", { count: "exact", head: true })
        .eq("family_id", family.id).eq("member_id", memberId);
      const total = count ?? 1;
      const max = settings.max_warnings ?? 3;
      if (total >= max) {
        const act = settings.warning_action ?? "kick";
        try {
          if (act === "ban") await banChatMember(msg.chat.id, userId);
          else if (act === "mute") await restrictChatMember(msg.chat.id, userId, Math.floor(Date.now()/1000) + 3600);
          else await banChatMember(msg.chat.id, userId);
        } catch (e) { console.warn("[mod] action failed", e); }
        await sendMessage(msg.chat.id, `🚫 ${mention} ${max} ta ogohlantirish oldi va guruhdan chiqarildi.`, { parse_mode: "HTML" });
      } else {
        await sendMessage(msg.chat.id, `⚠️ ${mention}, ${violation}. (${total}/${max})`, { parse_mode: "HTML" });
      }
    } else {
      // Not a registered family member — still notify with a tag
      await sendMessage(msg.chat.id, `⚠️ ${mention}, ${violation}.`, { parse_mode: "HTML" });
    }
  }

  await db.from("action_logs").insert({
    family_id: family.id, actor_telegram_id: userId,
    action: "auto_moderation", details: { reason: violation, action, chat_id: msg.chat.id },
  });
  await postLog(family.id, "moderation", `🤖 Avto-moderatsiya: <b>${action}</b>\nA'zo: <code>${userId}</code>\nSabab: ${violation}`);
  return true;
}

function escapeRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapeHtml(s: string) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
