// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPost } from "@/lib/api";

export const getSentimentTrend = (p: { familyId: string; days?: number }) =>
  apiGet(`/api/families/${p.familyId}/sentiment?days=${p.days ?? 90}`);

export const setSentimentOptOut = (p: { memberId: string; optOut: boolean }) =>
  apiPost(`/api/members/${p.memberId}/sentiment-opt-out`, { opt_out: p.optOut });
