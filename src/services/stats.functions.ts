// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet } from "@/lib/api";

export const getFamilyMessageStats = (p: { familyId: string; days?: number }) =>
  apiGet(`/api/families/${p.familyId}/stats/messages?days=${p.days ?? 30}`);
