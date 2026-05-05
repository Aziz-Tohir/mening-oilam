import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: events, error } = await supabase
      .from("events")
      .select("*")
      .eq("family_id", data.familyId)
      .order("event_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { events: events ?? [] };
  });

export const createEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    eventAt: z.string(), // ISO
    location: z.string().max(500).optional().nullable(),
    isRecurringYearly: z.boolean().default(false),
    notifyDaysBefore: z.array(z.number().int().min(0).max(365)).default([7,1,0]),
    notifyGroup: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("events").insert({
      family_id: data.familyId,
      title: data.title,
      description: data.description ?? null,
      event_at: data.eventAt,
      location: data.location ?? null,
      is_recurring_yearly: data.isRecurringYearly,
      notify_days_before: data.notifyDaysBefore,
      notify_group: data.notifyGroup,
      created_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    familyId: z.string().uuid(),
    id: z.string().uuid(),
    patch: z.record(z.string(), z.any()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("events")
      .update(data.patch as never)
      .eq("id", data.id)
      .eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("events").delete()
      .eq("id", data.id).eq("family_id", data.familyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upcomingBirthdays = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid(), days: z.number().int().min(1).max(365).default(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("family_members")
      .select("id, full_name, birth_date, telegram_id")
      .eq("family_id", data.familyId)
      .eq("status", "active")
      .not("birth_date", "is", null);
    if (error) throw new Error(error.message);

    const today = new Date();
    today.setHours(0,0,0,0);
    const horizon = data.days;
    const out = (rows ?? []).map((m: any) => {
      const bd = new Date(m.birth_date);
      const next = new Date(today.getFullYear(), bd.getMonth(), bd.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      const days = Math.round((next.getTime() - today.getTime()) / 86400000);
      const turning = next.getFullYear() - bd.getFullYear();
      return { ...m, next_birthday: next.toISOString().slice(0,10), days_until: days, turning_age: turning };
    }).filter(m => m.days_until <= horizon)
      .sort((a,b) => a.days_until - b.days_until);
    return { items: out };
  });
