// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet } from "@/lib/api";

export const listTelegramUpdates = (p?: {
  limit?: number;
  onlyErrors?: boolean;
  search?: string;
}) => {
  const params = new URLSearchParams();
  if (p?.limit) params.set("limit", String(p.limit));
  if (p?.onlyErrors) params.set("onlyErrors", "true");
  // search not supported server-side yet; filter client-side if provided
  const qs = params.toString() ? `?${params}` : "";
  return apiGet(`/api/admin/telegram-updates${qs}`);
};
