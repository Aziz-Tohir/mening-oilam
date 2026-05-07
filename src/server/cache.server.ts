// Simple in-memory TTL cache for hot-path lookups in the bot update loop.
// Note: each Worker isolate has its own cache; that's fine — TTL is short and
// values are cheap to refetch.

import { getAdminDb } from "./db.server";

type Entry<T> = { value: T; expires: number };
const store = new Map<string, Entry<any>>();

function get<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) { store.delete(key); return undefined; }
  return e.value as T;
}
function set<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function invalidateCache(prefix?: string) {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

// --- Domain helpers --------------------------------------------------------

const FAMILY_TTL = 60_000;
const SETTINGS_TTL = 30_000;
const BANNED_WORDS_TTL = 60_000;
const MEMBER_TTL = 30_000;

export async function getFamilyByChatId(chatId: number): Promise<{ id: string; telegram_group_id: number | null } | null> {
  const key = `fam:chat:${chatId}`;
  const cached = get<any>(key);
  if (cached !== undefined) return cached;
  const { data } = await getAdminDb()
    .from("families")
    .select("id, telegram_group_id")
    .eq("telegram_group_id", chatId)
    .maybeSingle();
  set(key, data ?? null, FAMILY_TTL);
  return (data as any) ?? null;
}

export async function getFamilySettings(familyId: string): Promise<any | null> {
  const key = `settings:${familyId}`;
  const cached = get<any>(key);
  if (cached !== undefined) return cached;
  const { data } = await getAdminDb()
    .from("family_settings")
    .select("*")
    .eq("family_id", familyId)
    .maybeSingle();
  set(key, data ?? null, SETTINGS_TTL);
  return data ?? null;
}

export async function getBannedWords(familyId: string): Promise<Array<{ pattern: string; is_regex: boolean; action: string }>> {
  const key = `banned:${familyId}`;
  const cached = get<any>(key);
  if (cached !== undefined) return cached;
  const { data } = await getAdminDb()
    .from("banned_words")
    .select("pattern, is_regex, action")
    .eq("family_id", familyId);
  const rows = (data as any[]) ?? [];
  set(key, rows, BANNED_WORDS_TTL);
  return rows;
}

export async function getMemberByTelegramId(familyId: string, telegramId: number): Promise<{ id: string; full_name?: string } | null> {
  const key = `mem:${familyId}:${telegramId}`;
  const cached = get<any>(key);
  if (cached !== undefined) return cached;
  const { data } = await getAdminDb()
    .from("family_members")
    .select("id, full_name")
    .eq("family_id", familyId)
    .eq("telegram_id", telegramId)
    .maybeSingle();
  set(key, data ?? null, MEMBER_TTL);
  return (data as any) ?? null;
}
