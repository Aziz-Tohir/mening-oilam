// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPost, apiDelete } from "@/lib/api";

// ---- Banned words ----
export const listBannedWords = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/bot/banned-words`);

export const addBannedWord = (p: {
  familyId: string;
  pattern: string;
  isRegex?: boolean;
  action?: "delete" | "warn" | "kick";
}) =>
  apiPost(`/api/families/${p.familyId}/bot/banned-words`, {
    pattern: p.pattern,
    is_regex: p.isRegex ?? false,
    action: p.action ?? "delete",
  });

export const deleteBannedWord = (p: { familyId: string; id: string }) =>
  apiDelete(`/api/families/${p.familyId}/bot/banned-words/${p.id}`);

// ---- Warnings ----
export const listWarnings = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/bot/warnings`);

export const addWarning = (p: { familyId: string; memberId: string; reason: string }) =>
  apiPost(`/api/families/${p.familyId}/bot/warnings`, {
    member_id: p.memberId,
    reason: p.reason,
  });

export const clearWarnings = (p: { familyId: string; memberId: string }) =>
  apiDelete(`/api/families/${p.familyId}/bot/warnings/${p.memberId}`);

// ---- Moderate member ----
export const moderateMember = (p: {
  familyId: string;
  memberId: string;
  action: "kick" | "ban" | "mute_1h" | "mute_24h" | "unban";
}) =>
  apiPost(`/api/families/${p.familyId}/bot/moderate/${p.memberId}`, { action: p.action });

// ---- Broadcast ----
export const sendBroadcast = (p: {
  familyId: string;
  target: "group" | "members";
  text: string;
  genderFilter?: "all" | "male" | "female";
  parseMode?: "none" | "HTML";
}) =>
  apiPost(`/api/families/${p.familyId}/bot/broadcast`, {
    target: p.target,
    text: p.text,
    gender_filter: p.genderFilter ?? "all",
    parse_mode: p.parseMode ?? "none",
  });

export const listBroadcasts = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/bot/broadcasts`);
