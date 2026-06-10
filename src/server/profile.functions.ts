// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPatch, apiPost } from "@/lib/api";

export const getMyMemberships = () =>
  apiGet(`/api/profile/memberships`);

export const updateMyProfile = (p: {
  memberId: string;
  patch: {
    full_name?: string;
    birth_date?: string | null;
    gender?: "male" | "female" | null;
    phone?: string | null;
    bio?: string | null;
    photo_url?: string | null;
    photo_is_private?: boolean;
  };
}) =>
  apiPatch(`/api/profile/members/${p.memberId}`, {
    full_name: p.patch.full_name,
    bio: p.patch.bio,
    photo_url: p.patch.photo_url,
    birth_date: p.patch.birth_date,
    phone: p.patch.phone,
  });

// Fetch the user's Telegram profile photo and save via the .NET backend.
export const importTelegramPhoto = (p: { memberId: string }) =>
  apiPost(`/api/profile/members/${p.memberId}/import-telegram-photo`);
