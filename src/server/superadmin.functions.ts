// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPatch, apiDelete, apiPost } from "@/lib/api";

export const listAllFamilies = () =>
  apiGet(`/api/admin/families`);

export const updateFamily = (p: {
  familyId: string;
  patch: {
    name?: string;
    telegram_group_id?: number | null;
    telegram_group_title?: string | null;
  };
}) =>
  apiPatch(`/api/admin/families/${p.familyId}`, { name: p.patch.name });

export const deleteFamily = (p: { familyId: string }) =>
  apiDelete(`/api/admin/families/${p.familyId}`);

export const transferFamilyOwnership = (p: { familyId: string; newOwnerUserId: string }) =>
  apiPost(`/api/admin/families/${p.familyId}/transfer`, {
    new_owner_user_id: p.newOwnerUserId,
  });
