// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet } from "@/lib/api";

export const computeKinship = (p: {
  familyId: string;
  fromMemberId: string;
  toMemberId: string;
}) =>
  apiGet(
    `/api/families/${p.familyId}/kinship?fromMemberId=${p.fromMemberId}&toMemberId=${p.toMemberId}`,
  );
