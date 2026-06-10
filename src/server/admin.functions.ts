// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export const listMembers = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/members`);

export const setMemberStatus = (p: { familyId: string; memberId: string; status: string }) =>
  apiPost(`/api/families/${p.familyId}/members/${p.memberId}/status`, { status: p.status });

export const updateMember = (p: { familyId: string; memberId: string; patch: any }) =>
  apiPatch(`/api/families/${p.familyId}/members/${p.memberId}`, p.patch);

export const addMemberManually = (p: any) =>
  apiPost(`/api/families/${p.familyId}/members`, {
    full_name: p.full_name, telegram_id: p.telegram_id, username: p.username,
    gender: p.gender, birth_date: p.birth_date, phone: p.phone,
  });

export const listJoinRequests = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/join-requests`);

export const listRelationships = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/relationships`);

export const addRelationship = (p: { familyId: string; memberId1: string; memberId2: string; relationshipType: string }) =>
  apiPost(`/api/families/${p.familyId}/relationships`, {
    member_id1: p.memberId1, member_id2: p.memberId2, relationship_type: p.relationshipType,
  });

export const deleteRelationship = (p: { familyId: string; id: string }) =>
  apiDelete(`/api/families/${p.familyId}/relationships/${p.id}`);

export const getSettings = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/settings`);

export const updateSettings = (p: { familyId: string; patch: any }) =>
  apiPatch(`/api/families/${p.familyId}/settings`, p.patch);

export const listBotIntegrations = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/bot/integrations`);

export const upsertBotIntegration = (p: { familyId: string; botUsername: string; mode: string; isActive: boolean }) =>
  apiPost(`/api/families/${p.familyId}/bot/integrations`, {
    bot_username: p.botUsername, mode: p.mode, is_active: p.isActive,
  });

export const listLogs = (p: { familyId: string; limit?: number }) =>
  apiGet(`/api/families/${p.familyId}/logs?limit=${p.limit ?? 50}`);
