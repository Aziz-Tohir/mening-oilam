// Centralized helper to post log messages to a family's forum log group.
// All log types go to a single Telegram forum group, but each type uses its own topic (message_thread_id).
import { getAdminDb } from "./db.server";
import { sendMessage } from "./telegram.server";

export type LogTopic = "actions" | "admin" | "moderation" | "backup";

const FIELD: Record<LogTopic, string> = {
  actions: "log_topic_actions",
  admin: "log_topic_admin",
  moderation: "log_topic_moderation",
  backup: "log_topic_backup",
};

export async function postLog(
  familyId: string,
  topic: LogTopic,
  text: string,
  options?: { parse_mode?: "HTML" | "Markdown" }
): Promise<void> {
  try {
    const db = getAdminDb();
    const { data: s } = await db
      .from("family_settings")
      .select("log_telegram_chat_id, log_topic_actions, log_topic_admin, log_topic_moderation, log_topic_backup")
      .eq("family_id", familyId)
      .maybeSingle();
    if (!s?.log_telegram_chat_id) return;
    const threadId = (s as any)[FIELD[topic]] as number | null | undefined;
    await sendMessage(s.log_telegram_chat_id, text, {
      parse_mode: options?.parse_mode ?? "HTML",
      ...(threadId ? { message_thread_id: threadId } : {}),
    });
  } catch (e) {
    console.warn("[logChannel] postLog failed", topic, e);
  }
}
