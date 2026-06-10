import { apiGet, apiPost } from "@/lib/api";

export const listMyFamilies = () => apiGet(`/api/families`);

export const createFamily = (p: {
  name: string; telegram_group_id?: number | null; telegram_group_title?: string | null;
  my_telegram_id?: number | null; my_full_name: string;
}) => apiPost(`/api/families`, p);

export const getFamilyStats = async (p: { familyId: string }) => {
  const r: any = await apiGet(`/api/families/${p.familyId}/stats`);
  return { members: r.members, pendingRequests: r.pending_requests, relationships: r.relationships };
};

export const regenerateInviteCode = (p: { familyId: string }) =>
  apiPost(`/api/families/${p.familyId}/regenerate-invite`);

export const getInviteInfo = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/invite`);
