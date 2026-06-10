// REST wrappers for the .NET backend (was Supabase server functions).
// /api/auth/me already returns role, family_id, and roles array — re-use it.
import { apiGet } from "@/lib/api";

export const getMyRole = async () => {
  const me: any = await apiGet(`/api/auth/me`);
  return {
    role: me?.role ?? null,
    familyId: me?.family_id ?? null,
    roles: (me?.roles ?? []) as Array<{ role: string; family_id: string | null }>,
  };
};
