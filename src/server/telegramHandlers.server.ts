// Telegram update dispatcher — runs on the server, called by the polling endpoint.
import { getAdminDb } from "./db.server";
import {
  sendMessage,
  answerCallbackQuery,
  deleteMessage,
  createChatInviteLink,
  banChatMember,
  restrictChatMember,
  unrestrictChatMember,
  getFile,
  downloadFile,
  sendPhotoBlob,
  sendVideoBlob,
  sendDocumentBlob,
} from "./telegram.server";
import { t, getUserLang, type Lang } from "./i18n.server";
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
        .select("delete_join_leave_messages, enforce_bot_onboarding, welcome_message_auto_delete_seconds, manage_foreign_bot_media")
        .eq("family_id", family.id)
        .maybeSingle();

      // Mute non-onboarded new members (joined directly without bot flow)
      if (msg.new_chat_members?.length && (settings as any)?.enforce_bot_onboarding !== false) {
        const myBotUsername = (process.env.BOT_USERNAME ?? "").replace(/^@/, "").toLowerCase();
        for (const u of msg.new_chat_members) {
          if (u.is_bot) continue;
          if ((u.username ?? "").toLowerCase() === myBotUsername) continue;
          // Already an active registered member?
          const { data: existing } = await db
            .from("family_members")
            .select("id")
            .eq("family_id", family.id)
            .eq("telegram_id", u.id)
            .eq("status", "active")
            .maybeSingle();
          if (existing) continue;

          try {
            await restrictChatMember(msg.chat.id, u.id);
            const mention = u.username ? `@${u.username}` : `<a href="tg://user?id=${u.id}">${fullName(u)}</a>`;
            const botUser = process.env.BOT_USERNAME ? `@${process.env.BOT_USERNAME.replace(/^@/, "")}` : "botga";
            const sent: any = await sendMessage(
              msg.chat.id,
              `👋 ${mention}, iltimos ${botUser} orqali ro'yxatdan o'ting. Tasdiqlangach guruhda yoza olasiz.`,
              { parse_mode: "HTML" },
            );
            const autoDel = (settings as any)?.welcome_message_auto_delete_seconds ?? 0;
            if (sent?.message_id && autoDel > 0) {
              setTimeout(() => { deleteMessage(msg.chat.id, sent.message_id).catch(() => {}); }, autoDel * 1000);
            }
            await db.from("action_logs").insert({
              family_id: family.id,
              action: "joined_unverified_muted",
              actor_telegram_id: u.id,
              details: { chat_id: msg.chat.id, username: u.username ?? null, full_name: fullName(u) },
            });
          } catch (e) {
            console.warn("[bot] failed to mute new member", u.id, e);
          }
        }
      }

      if ((msg.new_chat_members?.length || msg.left_chat_member) && settings?.delete_join_leave_messages !== false) {
        await deleteMessage(msg.chat.id, msg.message_id);
        return;
      }

      // Foreign bots: handle media via repost (with caption tag) or just delete
      const myBotUsername = (process.env.BOT_USERNAME ?? "").replace(/^@/, "").toLowerCase();
      const fromUser: any = (msg as any).from;
      if (fromUser?.is_bot && (fromUser.username ?? "").toLowerCase() !== myBotUsername) {
        await handleForeignBotMessage(msg, family.id, !!(settings as any)?.manage_foreign_bot_media);
        return;
      }

      // Auto-moderation (anti-link, anti-forward, anti-flood, banned words, media)
      const { moderateGroupMessage } = await import("./moderation.server");
      const moderated = await moderateGroupMessage(msg as any, { id: family.id, telegram_group_id: family.telegram_group_id! });
      if (moderated) return;

      // Track message stats (only if from a real user)
      if (msg.from && !msg.from.is_bot) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { data: mem } = await db.from("family_members")
            .select("id").eq("family_id", family.id).eq("telegram_id", msg.from.id).maybeSingle();
          const { data: existing } = await db.from("messages_stats")
            .select("id, messages_count")
            .eq("family_id", family.id).eq("telegram_id", msg.from.id).eq("message_date", today)
            .maybeSingle();
          if (existing) {
            await db.from("messages_stats").update({ messages_count: existing.messages_count + 1 }).eq("id", existing.id);
          } else {
            await db.from("messages_stats").insert({
              family_id: family.id, member_id: mem?.id ?? null, telegram_id: msg.from.id,
              message_date: today, messages_count: 1,
            });
          }
        } catch (e) { console.warn("[stats] track failed", e); }
      }
    }
    return;
  }

  // Private chat
  const text = msg.text?.trim() ?? "";
  const userId = msg.from?.id;
  if (!userId) return;

  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const payload = parts[1] ?? "";
    const lang = await getUserLang(db, userId);
    // Deep link: /start fam_<CODE>
    if (payload.startsWith("fam_")) {
      const code = payload.slice(4);
      const { data: fam } = await db.from("families").select("id, name").eq("invite_code", code).maybeSingle();
      if (fam) {
        await startJoinRequest(userId, msg.from!, fam.id, fam.name);
        return;
      }
      await sendMessage(userId, t("deep_link_invalid", lang));
      return;
    }
    await sendStartFlow(userId, msg.from!);
    return;
  }

  // Wizard input (e.g., new family name)
  const wizardHandled = await handleWizardInput(userId, msg);
  if (wizardHandled) return;

  if (text === "/help" || text === "/info") {
    await sendWelcome(userId);
    return;
  }

  if (text.startsWith("/kim")) {
    await startKinshipFlow(userId);
    return;
  }

  if (text.startsWith("/yordam")) {
    await handleHelpRequest(userId, msg.from, text.replace(/^\/yordam(@\S+)?\s*/, ""));
    return;
  }

  // Photo sent in private chat → set as avatar for active membership(s)
  if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
    await handleAvatarPhoto(userId, msg);
    return;
  }

  // Otherwise: treat as relative-name input for a pending join request
  await handleRelativeInput(userId, msg);
}

async function handleAvatarPhoto(userId: number, msg: TgMessage) {
  const db = getAdminDb();
  const { data: members } = await db
    .from("family_members")
    .select("id, family_id, user_id, families:family_id(name)")
    .eq("telegram_id", userId)
    .eq("status", "active");

  if (!members || members.length === 0) {
    await sendMessage(userId, "Avval oilaga qo'shiling, keyin rasm yuboring.");
    return;
  }

  // Use the largest photo size
  const sizes = msg.photo as any[];
  const best = sizes[sizes.length - 1];

  // Stash the file_id and ask for confirmation before overwriting avatars
  const { data: pending, error: pErr } = await db
    .from("pending_avatar_uploads")
    .insert({ telegram_id: userId, file_id: best.file_id } as never)
    .select("id")
    .single();
  if (pErr || !pending) {
    console.error("[bot] pending avatar insert failed", pErr);
    await sendMessage(userId, "❌ Rasmni qabul qilib bo'lmadi. Qaytadan urinib ko'ring.");
    return;
  }

  const familyNames = (members as any[]).map(m => m.families?.name).filter(Boolean).join(", ");
  const suffix = members.length > 1 ? ` (${members.length} oila: ${familyNames})` : familyNames ? ` (${familyNames})` : "";
  await sendMessage(
    userId,
    `🖼 Shajara profil rasmingizni shu rasmga o'zgartiraymi?${suffix}`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Ha, o'zgartirish", callback_data: `avok:${pending.id}` },
          { text: "❌ Yo'q", callback_data: `avno:${pending.id}` },
        ]],
      },
    },
  );
}

async function handleAvatarConfirm(cb: TgCallback, data: string) {
  const [action, pendingId] = data.split(":");
  const db = getAdminDb();
  const { data: pending } = await db
    .from("pending_avatar_uploads")
    .select("id, telegram_id, file_id")
    .eq("id", pendingId)
    .maybeSingle();

  if (!pending || pending.telegram_id !== cb.from.id) {
    await answerCallbackQuery(cb.id, "Topilmadi yoki muddati tugagan");
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "⌛️ Muddati tugagan.");
    return;
  }

  await db.from("pending_avatar_uploads").delete().eq("id", pendingId);

  if (action === "avno") {
    await answerCallbackQuery(cb.id, "Bekor qilindi");
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "❌ Profil rasmi o'zgartirilmadi.");
    return;
  }

  const { data: members } = await db
    .from("family_members")
    .select("id, user_id")
    .eq("telegram_id", cb.from.id)
    .eq("status", "active");

  if (!members || members.length === 0) {
    await answerCallbackQuery(cb.id, "Oila topilmadi");
    return;
  }

  await answerCallbackQuery(cb.id, "Yangilanmoqda…");
  try {
    const { setMemberAvatarFromTelegramFile } = await import("./avatar.server");
    for (const m of members) {
      await setMemberAvatarFromTelegramFile({
        fileId: pending.file_id,
        memberId: m.id,
        telegramId: cb.from.id,
        userId: m.user_id,
      });
    }
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, `✅ Profil rasmingiz yangilandi (${members.length} oilada).`);
  } catch (e) {
    console.error("[bot] avatar upload failed", e);
    if (cb.message) await editMessageTextSafe(cb.message.chat.id, cb.message.message_id, "❌ Rasmni saqlab bo'lmadi.");
  }
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
    "• /yordam &lt;matn&gt; — oila guruhiga yordam so'rovi yuborish",
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

// ---------- /start aqlli onboarding ----------
async function sendStartFlow(userId: number, from: TgUser) {
  const db = getAdminDb();
  const lang = await getUserLang(db, userId);

  // 1. Mavjud a'zo
  const { data: existingMemberships } = await db
    .from("family_members")
    .select("family_id, families:family_id(id, name)")
    .eq("telegram_id", userId)
    .eq("status", "active");

  if (existingMemberships && existingMemberships.length > 0) {
    const names = existingMemberships.map((m: any) => m.families?.name).filter(Boolean).join(", ");
    await sendMessage(userId, t("already_member", lang, { names: names || "oila" }));
    return;
  }

  // 2. Foydalanuvchi tili o'rnatilmaganmi? Til tanlash
  const { data: prof } = await db.from("profiles").select("language").eq("telegram_id", userId).maybeSingle();
  if (!prof?.language) {
    await sendMessage(userId, t("choose_lang", lang), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🇺🇿 O'zbekcha (lotin)", callback_data: "lang:uz" }, { text: "🇺🇿 Ўзбекча (кирилл)", callback_data: "lang:uz_cyrl" }],
          [{ text: "🇷🇺 Русский", callback_data: "lang:ru" }, { text: "🇬🇧 English", callback_data: "lang:en" }],
        ],
      },
    });
    return;
  }

  // 3. Yangi user — 2 tanlov
  await sendMessage(userId, `${t("welcome", lang)}\n\n${t("start_choose_action", lang)}`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: t("btn_create_family", lang), callback_data: "wiz:newfam" }],
        [{ text: t("btn_join_family", lang), callback_data: "wiz:joinfam" }],
      ],
    },
  });
}

// ---------- Wizard ----------
async function setSession(telegramId: number, step: string, data: Record<string, any> = {}) {
  const db = getAdminDb();
  await db.from("bot_sessions").upsert({
    telegram_id: telegramId, step, data, updated_at: new Date().toISOString(),
  } as any);
}
async function getSession(telegramId: number) {
  const db = getAdminDb();
  const { data } = await db.from("bot_sessions").select("step, data").eq("telegram_id", telegramId).maybeSingle();
  return data as { step: string; data: any } | null;
}
async function clearSession(telegramId: number) {
  const db = getAdminDb();
  await db.from("bot_sessions").delete().eq("telegram_id", telegramId);
}

async function handleWizardInput(userId: number, msg: TgMessage): Promise<boolean> {
  const session = await getSession(userId);
  if (!session) return false;
  const text = (msg.text ?? "").trim();
  const db = getAdminDb();
  const lang = await getUserLang(db, userId);

  if (session.step === "newfam_name") {
    if (!text || text.length < 2 || text.length > 100) {
      await sendMessage(userId, t("create_ask_name", lang), { parse_mode: "HTML" });
      return true;
    }
    // Linked profile?
    const { data: prof } = await db.from("profiles").select("user_id").eq("telegram_id", userId).maybeSingle();
    if (!prof?.user_id) {
      await clearSession(userId);
      await sendMessage(userId, "❌ Avval web sahifada tizimga kiring va Telegram'ni ulang. Keyin qaytadan urinib ko'ring.");
      return true;
    }
    const { data: fam, error: famErr } = await db.from("families").insert({
      name: text, owner_user_id: prof.user_id,
    } as any).select("id, invite_code, name").single();
    if (famErr || !fam) {
      console.error("[bot] family create failed", famErr);
      await sendMessage(userId, "❌ Oilani yaratib bo'lmadi.");
      await clearSession(userId);
      return true;
    }
    await db.from("user_roles").insert({ user_id: prof.user_id, family_id: fam.id, role: "superadmin" } as any);
    await db.from("family_settings").insert({ family_id: fam.id } as any);
    await clearSession(userId);

    const botUser = (process.env.BOT_USERNAME ?? "").replace(/^@/, "");
    const addUrl = botUser ? `https://t.me/${botUser}?startgroup=${fam.invite_code}` : null;
    await sendMessage(userId, t("create_done", lang, { name: fam.name }), { parse_mode: "HTML" });
    await sendMessage(userId, t("create_group_steps", lang), {
      parse_mode: "HTML",
      reply_markup: addUrl ? { inline_keyboard: [[{ text: t("btn_add_to_group", lang), url: addUrl }]] } : undefined,
    });
    return true;
  }

  return false;
}

// ---------- Begona bot media boshqaruvi ----------
async function handleForeignBotMessage(msg: TgMessage, familyId: string, repostEnabled: boolean) {
  const db = getAdminDb();
  // Always delete the original
  if (!repostEnabled) {
    await deleteMessage(msg.chat.id, msg.message_id);
    return;
  }
  // Try to identify a real user to credit (forward_from / via_bot user)
  const fwdFrom: any = (msg as any).forward_from;
  const reposterName = fwdFrom ? fullName(fwdFrom as any) : (msg as any).from?.username ?? "Mehmon";
  const lang = await getUserLang(db, (msg as any).from?.id ?? 0, familyId);
  const caption = t("foreign_media_caption", lang, { name: escapeHtml(String(reposterName)) });

  try {
    const photo = (msg as any).photo;
    const video = (msg as any).video;
    const doc = (msg as any).document;
    let fileId: string | null = null;
    let kind: "photo" | "video" | "document" | null = null;
    let filename = "file.bin";
    if (Array.isArray(photo) && photo.length) { fileId = photo[photo.length - 1].file_id; kind = "photo"; }
    else if (video?.file_id) { fileId = video.file_id; kind = "video"; filename = video.file_name ?? "video.mp4"; }
    else if (doc?.file_id) { fileId = doc.file_id; kind = "document"; filename = doc.file_name ?? "file.bin"; }

    if (!fileId || !kind) {
      await deleteMessage(msg.chat.id, msg.message_id);
      return;
    }
    const file = await getFile(fileId);
    const blob = await downloadFile(file.file_path);
    if (kind === "photo") await sendPhotoBlob(msg.chat.id, blob, caption);
    else if (kind === "video") await sendVideoBlob(msg.chat.id, blob, caption);
    else await sendDocumentBlob(msg.chat.id, blob, filename, caption);

    await deleteMessage(msg.chat.id, msg.message_id);
    await db.from("action_logs").insert({
      family_id: familyId, action: "foreign_media_reposted",
      details: { kind, original_bot: (msg as any).from?.username },
    });
  } catch (e) {
    console.warn("[bot] foreign media repost failed, fallback to delete", e);
    await deleteMessage(msg.chat.id, msg.message_id);
  }
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

  if (data.startsWith("avok:") || data.startsWith("avno:")) {
    await handleAvatarConfirm(cb, data);
    return;
  }

  if (data.startsWith("pickfam:")) {
    const familyId = data.split(":")[1];
    const { data: fam } = await db.from("families").select("id, name").eq("id", familyId).maybeSingle();
    if (fam) await startJoinRequest(cb.from.id, cb.from, fam.id, fam.name);
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    return;
  }

  if (data.startsWith("bday:")) {
    await handleBirthdayGreeting(cb, data.slice(5));
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

  if (data.startsWith("lang:")) {
    const newLang = data.split(":")[1] as Lang;
    await db.from("profiles").update({ language: newLang } as any).eq("telegram_id", cb.from.id);
    await answerCallbackQuery(cb.id, t("lang_set", newLang));
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    await sendStartFlow(cb.from.id, cb.from);
    return;
  }

  if (data === "wiz:newfam") {
    await setSession(cb.from.id, "newfam_name", {});
    await answerCallbackQuery(cb.id);
    const lang = await getUserLang(db, cb.from.id);
    await sendMessage(cb.from.id, t("create_ask_name", lang), { parse_mode: "HTML" });
    return;
  }
  if (data === "wiz:joinfam") {
    await answerCallbackQuery(cb.id);
    if (cb.message) await deleteMessage(cb.message.chat.id, cb.message.message_id);
    // Reuse legacy family-picker flow
    const { data: families } = await db.from("families").select("id, name, telegram_group_id").not("telegram_group_id", "is", null);
    if (!families || families.length === 0) {
      const lang = await getUserLang(db, cb.from.id);
      await sendMessage(cb.from.id, t("no_families", lang));
      return;
    }
    if (families.length === 1) {
      await startJoinRequest(cb.from.id, cb.from, families[0].id, families[0].name);
      return;
    }
    await sendMessage(cb.from.id, "Qaysi oilaga qo'shilmoqchisiz?", {
      reply_markup: { inline_keyboard: families.map(f => [{ text: f.name, callback_data: `pickfam:${f.id}` }]) },
    });
    return;
  }

  await answerCallbackQuery(cb.id);
}

export async function approveJoinRequest(req: any) {
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
    // If user is already in the group (joined directly and was muted), unmute them
    try {
      await unrestrictChatMember(family.telegram_group_id, req.applicant_telegram_id);
    } catch (e) {
      console.warn("[bot] unrestrict failed (user may not be in group yet)", e);
    }
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

// ---------- /yordam ----------
async function handleHelpRequest(userId: number, from: TgUser | undefined, message: string) {
  const text = (message ?? "").trim();
  if (!text) {
    await sendMessage(userId, "Foydalanish: <code>/yordam &lt;muammoyingiz&gt;</code>", { parse_mode: "HTML" });
    return;
  }
  const db = getAdminDb();
  const { data: members } = await db
    .from("family_members")
    .select("family_id, full_name, families:family_id(name, telegram_group_id)")
    .eq("telegram_id", userId)
    .eq("status", "active");
  if (!members || members.length === 0) {
    await sendMessage(userId, "Avval oilaga qo'shilishingiz kerak.");
    return;
  }
  let sent = 0;
  for (const m of members as any[]) {
    const groupId = m.families?.telegram_group_id;
    if (!groupId) continue;
    const name = escapeHtml(m.full_name || fullName(from));
    const body = escapeHtml(text);
    try {
      await sendMessage(groupId, `🆘 <b>Yordam so'rovi</b>\n👤 ${name}\n\n${body}`, { parse_mode: "HTML" });
      sent++;
      await db.from("action_logs").insert({
        family_id: m.family_id, actor_telegram_id: userId,
        action: "help_request", details: { text },
      });
    } catch (e) { console.warn("[bot] /yordam failed", e); }
  }
  await sendMessage(userId, sent > 0 ? `✅ Yordam so'rovingiz ${sent} ta guruhga yuborildi.` : "Guruh topilmadi.");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function handleBirthdayGreeting(cb: TgCallback, memberId: string) {
  const db = getAdminDb();
  const { data: member } = await db.from("family_members")
    .select("id, family_id, full_name, telegram_id, birth_date, families:family_id(telegram_group_id)")
    .eq("id", memberId).maybeSingle();
  if (!member) { await answerCallbackQuery(cb.id, "Topilmadi"); return; }
  const year = new Date().getFullYear();
  const greeterName = fullName(cb.from);
  const { error: insErr } = await db.from("birthday_greetings").insert({
    family_id: (member as any).family_id,
    member_id: member.id,
    greeter_telegram_id: cb.from.id,
    greeter_name: greeterName,
    greeting_year: year,
  } as any);
  if (insErr && !String(insErr.message).includes("duplicate")) {
    console.warn("[bday] insert err", insErr);
  }
  if (insErr) {
    await answerCallbackQuery(cb.id, "Allaqachon tabriklagansiz ✅");
    return;
  }
  await answerCallbackQuery(cb.id, "Tabrigingiz yuborildi 🎉");
  // Forward to birthday person privately
  if ((member as any).telegram_id) {
    try { await sendMessage((member as any).telegram_id, `🎂 ${greeterName} sizni tug'ilgan kuningiz bilan tabriklamoqda!`); } catch {}
  }
  // Group acknowledge
  const groupId = (member as any).families?.telegram_group_id;
  if (groupId) {
    try { await sendMessage(groupId, `🎉 ${greeterName} → ${member.full_name}`); } catch {}
  }
}

function _escapeHtml_unused(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
