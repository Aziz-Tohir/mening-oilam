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
import { calculateKinship, type EdgeRow } from "@/lib/kinship";

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

  // Group events
  if (msg.chat.type !== "private") {
    const { data: family } = await db
      .from("families")
      .select("id, telegram_group_id")
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

      // Auto-moderation (anti-link, anti-forward, anti-flood, banned words)
      const { moderateGroupMessage } = await import("./moderation.server");
      const moderated = await moderateGroupMessage(msg as any, { id: family.id, telegram_group_id: family.telegram_group_id! });
      if (moderated) return;
    }
    return;
  }

  // Private chat
  const text = msg.text?.trim() ?? "";
  const userId = msg.from?.id;
  if (!userId) return;

  if (text.startsWith("/start")) {
    await sendMessage(
      userId,
      "👋 Assalomu alaykum! Men <b>Shajara boti</b>man.\n\nTo'liq yordam uchun /help yuboring.",
      { parse_mode: "HTML" },
    );
    await sendStartFlow(userId, msg.from!);
    return;
  }

  if (text === "/help" || text === "/info") {
    await sendWelcome(userId);
    return;
  }

  if (text.startsWith("/kim")) {
    await startKinshipFlow(userId);
    return;
  }

  // Otherwise: treat as relative-name input for a pending join request
  await handleRelativeInput(userId, msg);
}

// ---------- /start welcome message ----------
async function sendWelcome(userId: number) {
  const text = [
    "👋 <b>Assalomu alaykum!</b>",
    "",
    "Men — <b>Shajara boti</b>man. Oilangizning shajarasini yuritish, qarindoshlik aloqalarini saqlash va guruhni boshqarishda yordam beraman.",
    "",
    "<b>📋 Buyruqlar:</b>",
    "• /start — oilaga qo'shilish so'rovini yuborish",
    "• /kim — kim kimga kim? (qarindoshlik kalkulyatori)",
    "• /help yoki /info — shu yordam xabari",
    "",
    "<b>✨ Nimalar qila olaman:</b>",
    "👨‍👩‍👧‍👦 <b>Oila daraxti</b> — barcha a'zolarni saqlash, ko'rish va eksport qilish (PNG/PDF)",
    "🔗 <b>Qarindoshlik</b> — istalgan ikki kishi orasidagi aloqa (masalan: amaki, jiyan, kuyov…)",
    "🎉 <b>Tadbirlar</b> — tug'ilgan kun, to'y, yubileylar uchun avtomatik eslatma",
    "📨 <b>So'rovlar</b> — yangi a'zolar admin tasdig'idan o'tadi",
    "🛡 <b>Guruh moderatsiyasi</b> — havola/forward/flud bloki, taqiqlangan so'zlar, ogohlantirish va kick/ban/mute",
    "📢 <b>E'lonlar</b> — adminlardan butun guruhga yoki shaxsan xabar",
    "",
    "<b>🌐 Mini App:</b> pastdagi menyu tugmasi <b>«Shajara»</b> ni bossangiz, to'liq admin panel Telegram ichida ochiladi.",
    "",
    "Boshlash uchun /start bosing yoki menyudan «Shajara» ni oching.",
  ].join("\n");
  await sendMessage(userId, text, { parse_mode: "HTML" });
}

// ---------- /start onboarding step 1 ----------
async function sendStartFlow(userId: number, from: TgUser) {
  const db = getAdminDb();

  // Check if user is already an active member of any family
  const { data: existingMemberships } = await db
    .from("family_members")
    .select("family_id, families:family_id(id, name)")
    .eq("telegram_id", userId)
    .eq("status", "active");

  if (existingMemberships && existingMemberships.length > 0) {
    const names = existingMemberships
      .map((m: any) => m.families?.name)
      .filter(Boolean)
      .join(", ");
    await sendMessage(
      userId,
      `✅ Siz allaqachon ${names || "oila"} a'zosisiz.\n\nMini App'ni ochish uchun pastdagi menyu tugmasini bosing yoki /kim buyrug'i orqali qarindoshlikni hisoblang.`,
    );
    return;
  }

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
        inline_keyboard: [
          ...chunk(
            RELATIONSHIP_OPTIONS.map(r => ({ text: r.label as string, callback_data: `rel:${req.id}:${r.value}` })),
            2,
          ),
          [{ text: "❌ Tanimayman", callback_data: `relno:${req.id}` }],
        ],
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

  if (data.startsWith("kim:")) {
    await handleKinshipCallback(cb, data);
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

  // Best-effort: pull Telegram profile photo as default avatar
  try {
    const { importTelegramPhotoForMember } = await import("./avatar.server");
    await importTelegramPhotoForMember({
      telegramId: req.applicant_telegram_id,
      memberId: newMember!.id,
    });
  } catch (e) { console.error("[bot] tg photo import failed", e); }

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

// ---------- /kim — kinship calculator ----------
async function findUserFamilies(userTelegramId: number) {
  const db = getAdminDb();
  const { data: rows } = await db.from("family_members")
    .select("family_id, families:family_id(id, name)")
    .eq("telegram_id", userTelegramId)
    .eq("status", "active");
  return (rows ?? []).map((r: any) => r.families).filter(Boolean);
}

async function setKimSession(userTgId: number, patch: { family_id?: string | null; first_member_id?: string | null }) {
  const db = getAdminDb();
  await db.from("kinship_sessions").upsert({
    user_telegram_id: userTgId,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}
async function getKimSession(userTgId: number) {
  const db = getAdminDb();
  const { data } = await db.from("kinship_sessions").select("family_id, first_member_id").eq("user_telegram_id", userTgId).maybeSingle();
  return data ?? { family_id: null, first_member_id: null };
}

async function startKinshipFlow(userTelegramId: number) {
  const fams = await findUserFamilies(userTelegramId);
  if (fams.length === 0) {
    await sendMessage(userTelegramId, "Siz hech qaysi oilada faol a'zo emassiz.");
    return;
  }
  await setKimSession(userTelegramId, { family_id: null, first_member_id: null });
  if (fams.length === 1) {
    await setKimSession(userTelegramId, { family_id: fams[0].id });
    return askKimPick(userTelegramId, fams[0].id, 0, "first");
  }
  await sendMessage(userTelegramId, "Qaysi oila bo'yicha?", {
    reply_markup: { inline_keyboard: fams.map((f: any) => [{ text: f.name, callback_data: `kim:f:${f.id}` }]) },
  });
}

async function askKimPick(chatId: number, familyId: string, page: number, step: "first" | "second") {
  const db = getAdminDb();
  const PAGE = 8;
  const session = await getKimSession(chatId);
  const firstId = session.first_member_id;
  const { data: members, count } = await db.from("family_members")
    .select("id, full_name", { count: "exact" })
    .eq("family_id", familyId)
    .eq("status", "active")
    .order("full_name")
    .range(page * PAGE, page * PAGE + PAGE - 1);

  const filtered = (members ?? []).filter(m => step === "first" || m.id !== firstId);
  const rows = chunk(filtered.map(m => ({
    text: m.full_name,
    callback_data: step === "first" ? `kim:1:${m.id}` : `kim:2:${m.id}`,
  })), 1);

  const navRow: any[] = [];
  const stepCode = step === "first" ? "a" : "b";
  if (page > 0) navRow.push({ text: "◀", callback_data: `kim:n:${stepCode}:${page - 1}` });
  if ((count ?? 0) > (page + 1) * PAGE) navRow.push({ text: "▶", callback_data: `kim:n:${stepCode}:${page + 1}` });
  if (navRow.length) rows.push(navRow);

  await sendMessage(chatId, step === "first" ? "👤 Birinchi a'zoni tanlang:" : "👥 Ikkinchi a'zoni tanlang:", {
    reply_markup: { inline_keyboard: rows },
  });
}

async function handleKinshipCallback(cb: TgCallback, data: string) {
  const parts = data.split(":");
  const sub = parts[1];
  const chatId = cb.from.id;

  if (sub === "f") {
    const familyId = parts[2];
    await setKimSession(chatId, { family_id: familyId, first_member_id: null });
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    await askKimPick(chatId, familyId, 0, "first");
    return;
  }
  if (sub === "n") {
    const stepCode = parts[2];
    const page = Number(parts[3]);
    const session = await getKimSession(chatId);
    if (!session.family_id) { await answerCallbackQuery(cb.id, "Sessiya tugagan, /kim ni qayta yuboring"); return; }
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    await askKimPick(chatId, session.family_id, page, stepCode === "a" ? "first" : "second");
    return;
  }
  if (sub === "1") {
    const memberId = parts[2];
    const session = await getKimSession(chatId);
    if (!session.family_id) { await answerCallbackQuery(cb.id, "Sessiya tugagan, /kim ni qayta yuboring"); return; }
    await setKimSession(chatId, { first_member_id: memberId });
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    await askKimPick(chatId, session.family_id, 0, "second");
    return;
  }
  if (sub === "2") {
    const secondId = parts[2];
    const session = await getKimSession(chatId);
    if (!session.family_id || !session.first_member_id) { await answerCallbackQuery(cb.id, "Sessiya tugagan, /kim ni qayta yuboring"); return; }
    await answerCallbackQuery(cb.id, "Hisoblanmoqda…");
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    await computeAndReplyKinship(chatId, session.family_id, session.first_member_id, secondId);
    return;
  }
  await answerCallbackQuery(cb.id);
}

async function computeAndReplyKinship(chatId: number, familyId: string, fromId: string, toId: string) {
  const db = getAdminDb();
  const [{ data: edges }, { data: from }, { data: to }] = await Promise.all([
    db.from("relationships").select("member_id_1, member_id_2, relationship_type").eq("family_id", familyId),
    db.from("family_members").select("full_name").eq("id", fromId).maybeSingle(),
    db.from("family_members").select("full_name").eq("id", toId).maybeSingle(),
  ]);
  if (!from || !to) {
    await sendMessage(chatId, "A'zo topilmadi.");
    return;
  }
  const result = calculateKinship((edges ?? []) as EdgeRow[], fromId, toId);
  if (!result.found) {
    await sendMessage(chatId, `❌ ${from.full_name} va ${to.full_name} orasida aloqa topilmadi.\n\nQarindoshlik aloqalarini admin panelida qo'shing.`);
    return;
  }
  const chainTxt = result.chain.length > 1 ? `\n\nYo'l: ${result.chain.map(relationshipLabel).join(" → ")}` : "";
  await sendMessage(chatId, `🌳 *${to.full_name}* — *${from.full_name}*ga *${result.label}* bo'ladi.${chainTxt}`, { parse_mode: "Markdown" });
}
