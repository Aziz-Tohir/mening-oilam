// REST wrappers for the .NET backend (was Supabase server functions).
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

export const listEvents = (p: { familyId: string }) =>
  apiGet(`/api/families/${p.familyId}/events`);

export const createEvent = (p: {
  familyId: string;
  title: string;
  description?: string | null;
  eventAt: string;
  location?: string | null;
  isRecurringYearly?: boolean;
  notifyDaysBefore?: number[];
  notifyGroup?: boolean;
}) =>
  apiPost(`/api/families/${p.familyId}/events`, {
    title: p.title,
    description: p.description ?? null,
    event_at: p.eventAt,
    location: p.location ?? null,
    is_recurring_yearly: p.isRecurringYearly ?? false,
    notify_days_before: p.notifyDaysBefore ?? [7, 1, 0],
    notify_group: p.notifyGroup ?? true,
  });

export const updateEvent = (p: { familyId: string; id: string; patch: Record<string, any> }) =>
  apiPatch(`/api/families/${p.familyId}/events/${p.id}`, p.patch);

export const deleteEvent = (p: { familyId: string; id: string }) =>
  apiDelete(`/api/families/${p.familyId}/events/${p.id}`);

export const upcomingBirthdays = (p: { familyId: string; days?: number }) =>
  apiGet(`/api/families/${p.familyId}/birthdays?days=${p.days ?? 60}`);
