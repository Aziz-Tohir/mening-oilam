// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet } from "@/lib/api";

export const exportFamilyTreeJson = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/export`);
