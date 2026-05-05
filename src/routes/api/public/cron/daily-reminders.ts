// Daily reminder cron — sends Telegram messages for upcoming events and birthdays.
// Protected by ?secret= query matching CRON_SECRET.
import { createFileRoute } from "@tanstack/react-router";
import { getAdminDb } from "@/server/db.server";
import { sendMessage } from "@/server/telegram.server";

async function logSent(db: ReturnType<typeof getAdminDb>, family_id: string, kind: string, ref_id: string, notify_date: string) {
  const { error } = await db.from("notification_log").insert({ family_id, kind, ref_id, notify_date });
  return !error;
}

async function alreadySent(db: ReturnType<typeof getAdminDb>, kind: string, ref_id: string, notify_date: string) {
  const { data } = await db.from("notification_log").select("id").eq("kind", kind).eq("ref_id", ref_id).eq("notify_date", notify_date).maybeSingle();
  return !!data;
}

async function processFamily(db: ReturnType<typeof getAdminDb>, family: any, today: Date) {
  const todayISO = today.toISOString().slice(0, 10);

  // Birthdays — find members whose birthday is exactly today (month+day)
  const { data: members } = await db.from("family_members")
    .select("id, full_name, birth_date, telegram_id")
    .eq("family_id", family.id)
    .eq("status", "active")
    .not("birth_date", "is", null);

  for (const m of members ?? []) {
    if (!m.birth_date) continue;
    const bd = new Date(m.birth_date);
    if (bd.getMonth() !== today.getMonth() || bd.getDate() !== today.getDate()) continue;
    if (await alreadySent(db, "birthday", m.id, todayISO)) continue;

    const age = today.getFullYear() - bd.getFullYear();
    const groupText = `🎂 Bugun *${m.full_name}* ning tug'ilgan kuni! ${age} yoshga to'ldi. Tabriklaymiz! 🎉`;

    if (family.telegram_group_id) {
      try { await sendMessage(family.telegram_group_id, groupText, { parse_mode: "Markdown" }); } catch (e) { console.error("group bday send", e); }
    }
    // DM other active members
    for (const other of members ?? []) {
      if (other.id === m.id || !other.telegram_id) continue;
      try { await sendMessage(other.telegram_id, `Bugun ${m.full_name} ning tug'ilgan kuni 🎂`); } catch {}
    }
    await logSent(db, family.id, "birthday", m.id, todayISO);
  }

  // Events — load all upcoming events for this family
  const { data: events } = await db.from("events").select("*").eq("family_id", family.id);
  for (const ev of events ?? []) {
    const evDate = new Date(ev.event_at);
    // Compute occurrences to consider (this year and next year if recurring)
    const candidates: Date[] = [];
    if (ev.is_recurring_yearly) {
      const thisYear = new Date(today.getFullYear(), evDate.getMonth(), evDate.getDate(), evDate.getHours(), evDate.getMinutes());
      const nextYear = new Date(today.getFullYear() + 1, evDate.getMonth(), evDate.getDate(), evDate.getHours(), evDate.getMinutes());
      candidates.push(thisYear, nextYear);
    } else {
      candidates.push(evDate);
    }

    for (const occurrence of candidates) {
      const occDay = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate());
      const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const daysUntil = Math.round((occDay.getTime() - todayDay.getTime()) / 86400000);
      if (daysUntil < 0) continue;
      if (!(ev.notify_days_before as number[]).includes(daysUntil)) continue;

      const refKey = `${ev.id}:${occurrence.toISOString().slice(0,10)}:${daysUntil}`;
      // Use ref_id = ev.id; notify_date = the occurrence date + days marker via combined
      const notifyMarker = `${occurrence.toISOString().slice(0,10)}`; // store occurrence date
      // Distinguish multiple offsets by appending days into notify_date string? notify_date is DATE — use today's date.
      if (await alreadySent(db, `event_reminder_${daysUntil}`, ev.id, todayISO)) continue;

      const whenStr = occurrence.toLocaleString("uz-UZ", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      const lead = daysUntil === 0 ? "Bugun" : daysUntil === 1 ? "Ertaga" : `${daysUntil} kundan keyin`;
      const msg = `📅 *${lead}*: ${ev.title}\n🕒 ${whenStr}${ev.location ? `\n📍 ${ev.location}` : ""}${ev.description ? `\n\n${ev.description}` : ""}`;

      if (ev.notify_group && family.telegram_group_id) {
        try { await sendMessage(family.telegram_group_id, msg, { parse_mode: "Markdown" }); } catch (e) { console.error("group event send", e); }
      }
      // DM all active members
      for (const m of members ?? []) {
        if (!m.telegram_id) continue;
        try { await sendMessage(m.telegram_id, msg, { parse_mode: "Markdown" }); } catch {}
      }
      await logSent(db, family.id, `event_reminder_${daysUntil}`, ev.id, todayISO);
      void refKey; void notifyMarker;
    }
  }
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getAdminDb();
  const { data: families } = await db.from("families").select("id, name, telegram_group_id");
  const today = new Date();
  let processed = 0;
  for (const fam of families ?? []) {
    try { await processFamily(db, fam, today); processed++; } catch (e) { console.error("family err", fam.id, e); }
  }
  return Response.json({ ok: true, families: processed });
}

export const Route = createFileRoute("/api/public/cron/daily-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
