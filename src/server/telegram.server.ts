// Telegram gateway helpers — server-only.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function getCreds() {
  const lovable = process.env.LOVABLE_API_KEY;
  const tg = process.env.TELEGRAM_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY is not configured");
  if (!tg) throw new Error("TELEGRAM_API_KEY is not configured");
  return { lovable, tg };
}

export async function tgCall<T = any>(method: string, body?: Record<string, unknown>): Promise<T> {
  const { lovable, tg } = getCreds();
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": tg,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(`Telegram ${method} failed [${res.status}]: ${JSON.stringify(data)}`);
  }
  return (data.result ?? data) as T;
}

export type TgInlineButton = { text: string; callback_data?: string; url?: string };

export async function sendMessage(chatId: number | string, text: string, options?: {
  reply_markup?: { inline_keyboard: TgInlineButton[][] };
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_to_message_id?: number;
  disable_notification?: boolean;
}) {
  return tgCall("sendMessage", { chat_id: chatId, text, ...options });
}

export async function answerCallbackQuery(callback_query_id: string, text?: string, show_alert = false) {
  return tgCall("answerCallbackQuery", { callback_query_id, text, show_alert });
}

export async function editMessageText(chatId: number | string, messageId: number, text: string, options?: {
  reply_markup?: { inline_keyboard: TgInlineButton[][] };
  parse_mode?: "HTML" | "Markdown";
}) {
  return tgCall("editMessageText", { chat_id: chatId, message_id: messageId, text, ...options });
}

export async function deleteMessage(chatId: number | string, messageId: number) {
  try {
    return await tgCall("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch (e) {
    console.warn("[telegram] deleteMessage failed", e);
  }
}

export async function getChatMember(chatId: number | string, userId: number) {
  return tgCall("getChatMember", { chat_id: chatId, user_id: userId });
}

export async function getChatAdministrators(chatId: number | string) {
  return tgCall<any[]>("getChatAdministrators", { chat_id: chatId });
}

export async function createChatInviteLink(chatId: number | string, opts?: {
  expire_date?: number; member_limit?: number; name?: string;
}) {
  return tgCall("createChatInviteLink", { chat_id: chatId, ...opts });
}

export async function banChatMember(chatId: number | string, userId: number) {
  return tgCall("banChatMember", { chat_id: chatId, user_id: userId });
}

export async function unbanChatMember(chatId: number | string, userId: number) {
  return tgCall("unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true });
}

export async function getUpdates(offset: number, timeout = 25, allowedUpdates: string[] = ["message","edited_message","callback_query","my_chat_member","chat_member"]) {
  return tgCall<any[]>("getUpdates", {
    offset,
    timeout,
    allowed_updates: allowedUpdates,
  });
}

export async function forwardMessage(chatId: number | string, fromChatId: number | string, messageId: number) {
  return tgCall("forwardMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId });
}

export async function restrictChatMember(chatId: number | string, userId: number, untilDate?: number) {
  return tgCall("restrictChatMember", {
    chat_id: chatId, user_id: userId,
    permissions: { can_send_messages: false, can_send_media_messages: false, can_send_polls: false, can_send_other_messages: false, can_add_web_page_previews: false },
    until_date: untilDate,
  });
}
