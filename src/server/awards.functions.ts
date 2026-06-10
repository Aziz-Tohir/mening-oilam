// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet } from "@/lib/api";

export const listNominations = (p: { familyId: string; year?: number }) => {
  const qs = p.year ? `?year=${p.year}` : "";
  return apiGet(`/api/families/${p.familyId}/nominations${qs}`);
};

export const listMemories = (p: { familyId: string; year?: number; limit?: number }) => {
  const params = new URLSearchParams();
  if (p.year) params.set("year", String(p.year));
  if (p.limit) params.set("limit", String(p.limit));
  const qs = params.toString() ? `?${params}` : "";
  return apiGet(`/api/families/${p.familyId}/memories${qs}`);
};
