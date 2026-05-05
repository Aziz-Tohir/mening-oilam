// Telegram update dispatcher — runs on the server, called by the polling endpoint.
import { getAdminDb } from "./db.server";
import {
  sendMessage,
  answerCallbackQuery,
  deleteMessage,
  createChatInviteLink,
  banChatMember,
} from "./telegram.server";
import { RELATIONSHIP_OPTIONS, relationshipLabel } from "@/lib/relationships";

type TgUser = { id: number; is_bot?: boolean; username?: string; first_name?: string; last_name?: string };
type TgChat = { id: number; type: string; title?: string; username?: string };
type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  contact?: { phone_number: string; first_name: string; last_name?: string; user_id?: number };
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  reply_markup?: any;
  video?: any; photo?: any; document?: any;
};
type TgCallback = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
};
type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
  my_chat_member?: any;
  chat_member?: any;
};

function fullName(u: TgUser | undefined): string {
  if (!u) return "Noma'lum";
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.username || `id${u.id}`;
}

export async function processUpdate(update: TgUpdate) {
  try {
    if (update.callback_query) return await handleCallback(update.callback_query);
    if (update.message) return await handleMessage(update.message);
    if (update.edited_message) return; // ignore edits for now
    if (update.my_chat_member) return await handleMyChatMember(update.my_chat_member);
  } catch (err) {
    console.error("[bot] processUpdate error", err);
    throw err;
  }
}

// ---------- group bookkeeping ----------
async function handleMyChatMember(evt: any) {
  // When the bot is added to/removed from a group
  const chat = evt.chat;
  const newStatus = evt.new_chat_member?.status;
  if (!chat || chat.type === "private") return;
  if (["administrator", "member"].includes(newStatus)) {
    const db = getAdminDb();
    // Optionally upsert a "pending" family entry — don't auto-create; let the owner do it from admin panel.
    await db.from("action_logs").insert({
      family_id: null,
      action: "bot_added_to_group",
      details: { chat_id: chat.id, title: chat.title, status: newStatus },
    });
  }
}

// ---------- messages ----------
async function handleMessage(msg: TgMessage) {
  const db = getAdminDb();

  // Group events: join/leave cleanup
  if (msg.chat.type !== "private") {
    const { data: family } = await db
      .from("families")
      .select("id")
      .eq("telegram_group_id", msg.chat.id)
      .maybeSingle();

    if (family) {
      const { data: settings } = await db
        .from("family_settings")
        .select("delete_join_leave_messages")
        .eq("family_id", family.id)
        .maybeSingle();

      if ((msg.new_chat_members?.length || msg.left_chat_member) && settings?.delete_join_leave_messages !== false) {
        await deleteMessage(msg.chat.id, msg.message_id);
        return;
      }
    }
    return; // No other group handling in MVP
  }

  // Private chat
  const text = msg.text?.trim() ?? "";
  const userId = msg.from?.id;
  if (!userId) return;

  if (text.startsWith("/start")) {
    await sendStartFlow(userId, msg.from!);
    return;
  }

  if (text === "/help") {
    await sendMessage(userId, "Shajara botiga xush kelibsiz! Oilaga qo'shilish uchun /start ni bosing.");
    return;
  }

  // Otherwise: treat as relative-name input for a pending join request
  await handleRelativeInput(userId, msg);
}

// ---------- /start onboarding step 1 ----------
async function sendStartFlow(userId: number, from: TgUser) {
  const db = getAdminDb();

  // List active families. If only one — auto-pick it. If many — show keyboard.
  const { data: families } = await db.from("families").select("id, name, telegram_group_id").not("telegram_group_id", "is", null);

  if (!families || families.length === 0) {
    await sendMessage(
      userId,
      "Hozircha hech qanday oila ulanmagan. Iltimos, oila admini bilan bog'laning.",
    );
    return;
  }

  if (families.length === 1) {
    return startJoinRequest(userId, from, families[0].id, families[0].name);
  }

  await sendMessage(userId, "Salom! Qaysi oilaga qo'shilmoqchisiz?", {
    reply_markup: {
      inline_keyboard: families.map(f => [{ text: f.name, callback_data: `pickfam:${f.id}` }]),
    },
  });
}

async function startJoinRequest(userId: number, from: TgUser, familyId: string, familyName: string) {
  const db = getAdminDb();

  // Reuse existing pending request or create new
  const { data: existing } = await db
    .from("join_requests")
    .select("id, status")
    .eq("family_id", familyId)
    .eq("applicant_telegram_id", userId)
    .in("status", ["awaiting_relative_choice", "awaiting_relative_confirm", "awaiting_admin_approval"])
    .maybeSingle();

  if (!existing) {
    await db.from("join_requests").insert({
      family_id: familyId,
      applicant_telegram_id: userId,
      applicant_username: from.username ?? null,
      applicant_full_name: fullName(from),
      status: "awaiting_relative_choice",
    });
  }

  await sendMessage(
    userId,
    `Siz ${familyName} oilasiga qo'shilmoqchisiz.\n\nSizning qarindoshingizning Telegram username'ini yozing (masalan: @username) yoki uning kontaktini yuboring.`,
  );
}

async function handleRelativeInput(userId: number, msg: TgMessage) {
  const db = getAdminDb();
  const { data: req } = await db
    .from("join_requests")
    .select("id, family_id, status")
    .eq("applicant_telegram_id", userId)
    .eq("status", "awaiting_relative_choice")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!req) {
    await sendMessage(userId, "Iltimos, /start buyrug'idan boshlang.");
    return;
  }

  let relativeTelegramId: number | null = null;
  let relativeUsername: string | null = null;

  if (msg.contact?.user_id) {
    relativeTelegramId = msg.contact.user_id;
  } else if (msg.text) {
    const m = msg.text.match(/@?([A-Za-z0-9_]{4,})/);
    relativeUsername = m ? m[1] : null;
  }

  if (!relativeTelegramId && !relativeUsername) {
    await sendMessage(userId, "Username yoki kontaktni yuboring.");
    return;
  }

  // Find member in the family
  const query = db.from("family_members").select("id, telegram_id, username, full_name").eq("family_id", req.family_id).eq("status", "active");
  const { data: candidates } = relativeTelegramId
    ? await query.eq("telegram_id", relativeTelegramId)
    : await query.ilike("username", relativeUsername!);

  const relative = candidates?.[0];
  if (!relative) {
    await sendMessage(userId, "Bu qarindosh oila a'zolari ro'yxatida topilmadi. Boshqa username yoki kontakt yuboring.");
    return;
  }

  // Save hint and request relative confirmation
  await db.from("join_requests").update({
    relative_member_id: relative.id,
    relative_hint: relativeUsername ?? String(relativeTelegramId ?? ""),
    status: "awaiting_relative_confirm",
  }).eq("id", req.id);

  await sendMessage(userId, `Yaxshi. ${relative.full_name}'dan tasdiq so'raldi. Iltimos, kuting.`);

  // Ask the relative
  await sendMessage(
    relative.telegram_id,
    `Salom! ${msg.from?.first_name ?? ""} (${msg.from?.username ? "@" + msg.from.username : "id" + userId}) sizni qarindoshim deb ko'rsatdi va oilaga qo'shilmoqchi.\n\nU sizga kim bo'ladi?`,
    {
      reply_markup: {
        inline_keyboard: chunk(
          RELATIONSHIP_OPTIONS.map(r => ({ text: r.label, callback_data: `rel:${req.id}:${r.value}` })),
          2,
        ).concat([[{ text: "❌ Tanimayman", callback_data: `relno:${req.id}` }]]),
      },
    },
  );
}

// ---------- callbacks ----------
async function handleCallback(cb: TgCallback) {
  const data = cb.data ?? "";
  const db = getAdminDb();

  if (data.startsWith("pickfam:")) {
    const familyId = data.split(":")[1];
    const { data: fam } = await db.from("families").select("id, name").eq("id", familyId).maybeSingle();
    if (fam) await startJoinRequest(cb.from.id, cb.from, fam.id, fam.name);
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    return;
  }

  if (data.startsWith("rel:")) {
    const [, requestId, relType] = data.split(":");
    const { data: req } = await db.from("join_requests").select("*").eq("id", requestId).maybeSingle();
    if (!req) { await answerCallbackQuery(cb.id, "So'rov topilmadi"); return; }

    await db.from("join_requests").update({
      relationship_type: relType as any,
      status: "awaiting_admin_approval",
    }).eq("id", requestId);

    await answerCallbackQuery(cb.id, "Rahmat!");
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id,
      `✅ Rahmat! Adminlarga ${relationshipLabel(relType)} sifatida tasdiq uchun yuborildi.`);

    // Notify admins
    await notifyFamilyAdmins(req.family_id, requestId, req, relType, cb.from);
    return;
  }

  if (data.startsWith("relno:")) {
    const requestId = data.split(":")[1];
    await db.from("join_requests").update({
      status: "rejected",
      reject_reason: "Tasdiqlovchi tanimadi",
      decided_at: new Date().toISOString(),
    }).eq("id", requestId);
    await answerCallbackQuery(cb.id, "Rad etildi");
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "❌ Rad etildi.");

    const { data: req } = await db.from("join_requests").select("applicant_telegram_id").eq("id", requestId).maybeSingle();
    if (req) await sendMessage(req.applicant_telegram_id, "Sizning so'rovingiz rad etildi (qarindosh tanimadi).");
    return;
  }

  if (data.startsWith("approve:") || data.startsWith("reject:")) {
    const [action, requestId] = data.split(":");
    const { data: req } = await db.from("join_requests").select("*").eq("id", requestId).maybeSingle();
    if (!req) { await answerCallbackQuery(cb.id, "Topilmadi"); return; }
    if (req.status !== "awaiting_admin_approval") {
      await answerCallbackQuery(cb.id, "Bu so'rov allaqachon ko'rib chiqilgan");
      return;
    }

    // Verify approver is an admin of the family group
    const isAdmin = await isTelegramAdminOfFamily(req.family_id, cb.from.id);
    if (!isAdmin) { await answerCallbackQuery(cb.id, "Faqat admin tasdiqlay oladi", true); return; }

    if (action === "reject") {
      await db.from("join_requests").update({
        status: "rejected", decided_at: new Date().toISOString(), reject_reason: "Admin rad etdi",
      }).eq("id", requestId);
      await sendMessage(req.applicant_telegram_id, "Sizning so'rovingiz admin tomonidan rad etildi.");
      await answerCallbackQuery(cb.id, "Rad etildi");
      if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "❌ Rad etildi.");
      return;
    }

    // Approve
    await approveJoinRequest(req);
    await answerCallbackQuery(cb.id, "Tasdiqlandi");
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "✅ Tasdiqlandi.");
    return;
  }

  await answerCallbackQuery(cb.id);
}

async function approveJoinRequest(req: any) {
  const db = getAdminDb();

  // Insert family_member
  const { data: newMember, error: memErr } = await db.from("family_members").insert({
    family_id: req.family_id,
    telegram_id: req.applicant_telegram_id,
    username: req.applicant_username,
    full_name: req.applicant_full_name ?? `id${req.applicant_telegram_id}`,
    status: "active",
    invited_by: req.relative_member_id,
    relationship_to_inviter: req.relationship_type,
  }).select("id").single();

  if (memErr) throw memErr;

  // Add relationship
  if (req.relative_member_id && req.relationship_type) {
    await db.from("relationships").insert({
      family_id: req.family_id,
      member_id_1: req.relative_member_id,
      member_id_2: newMember!.id,
      relationship_type: req.relationship_type,
    });
  }

  await db.from("join_requests").update({
    status: "approved",
    decided_at: new Date().toISOString(),
  }).eq("id", req.id);

  // Send invite link
  const { data: family } = await db.from("families").select("telegram_group_id, name").eq("id", req.family_id).maybeSingle();
  if (family?.telegram_group_id) {
    try {
      const link: any = await createChatInviteLink(family.telegram_group_id, {
        member_limit: 1,
        name: `join-${req.id.slice(0,8)}`,
      });
      await sendMessage(
        req.applicant_telegram_id,
        `🎉 Tasdiqlandi! ${family.name} oilasiga qo'shilish uchun:\n${link.invite_link}`,
      );

      // Group announcement
      await sendMessage(
        family.telegram_group_id,
        `🌳 ${req.applicant_full_name ?? "Yangi a'zo"} oilamizga qo'shildi.`,
      );
    } catch (e) {
      console.error("[bot] invite link failed", e);
      await sendMessage(req.applicant_telegram_id, "Tasdiqlandi, lekin invite link yaratib bo'lmadi. Admin bilan bog'laning.");
    }
  }

  await db.from("action_logs").insert({
    family_id: req.family_id,
    action: "join_request_approved",
    details: { request_id: req.id, applicant: req.applicant_telegram_id },
  });
}

async function notifyFamilyAdmins(familyId: string, requestId: string, req: any, relType: string, confirmer: TgUser) {
  const db = getAdminDb();
  // Find admin family_members (those with user_id linked to admin role)
  const { data: roleRows } = await db.from("user_roles").select("user_id").eq("family_id", familyId).in("role", ["admin","superadmin"]);
  const userIds = (roleRows ?? []).map(r => r.user_id);
  if (userIds.length === 0) {
    console.warn("[bot] no admins for family", familyId);
    return;
  }
  const { data: adminMembers } = await db.from("family_members")
    .select("telegram_id, full_name")
    .eq("family_id", familyId)
    .in("user_id", userIds);

  const text = `🔔 Yangi a'zo so'rovi:\n\n👤 ${req.applicant_full_name} (${req.applicant_username ? "@"+req.applicant_username : "id"+req.applicant_telegram_id})\n👥 Tasdiqlovchi: ${fullName(confirmer)}\n💞 Aloqa: ${relationshipLabel(relType)}\n\nTasdiqlaysizmi?`;
  const kb = { inline_keyboard: [[
    { text: "✅ Tasdiqlash", callback_data: `approve:${requestId}` },
    { text: "❌ Rad etish",   callback_data: `reject:${requestId}` },
  ]]};

  for (const m of adminMembers ?? []) {
    try {
      await sendMessage(m.telegram_id, text, { reply_markup: kb });
      await db.from("admin_notifications").insert({
        family_id: familyId, notification_type: "join_request",
        message_text: text, related_join_request: requestId,
      });
    } catch (e) {
      console.warn("[bot] notify admin failed", m.telegram_id, e);
    }
  }
}

async function isTelegramAdminOfFamily(familyId: string, telegramId: number): Promise<boolean> {
  const db = getAdminDb();
  const { data: member } = await db.from("family_members")
    .select("user_id")
    .eq("family_id", familyId).eq("telegram_id", telegramId).maybeSingle();
  if (!member?.user_id) return false;
  const { data: role } = await db.from("user_roles")
    .select("role").eq("family_id", familyId).eq("user_id", member.user_id).in("role", ["admin", "superadmin"]).maybeSingle();
  return !!role;
}

// ---------- helpers ----------
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function editMessageTextSafe(chatId: number, messageId: number, text: string) {
  try {
    const { editMessageText } = await import("./telegram.server");
    await editMessageText(chatId, messageId, text);
  } catch (e) {
    console.warn("[bot] editMessageText failed", e);
  }
}
