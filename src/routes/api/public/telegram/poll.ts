// Public polling endpoint — called every minute by an external cron (e.g. cron-job.org).
// Protected by CRON_SECRET. Long-polls Telegram and processes updates.
import { createFileRoute } from "@tanstack/react-router";
import { getAdminDb } from "@/server/db.server";
import { getUpdates } from "@/server/telegram.server";
import { processUpdate } from "@/server/telegramHandlers.server";

export const Route = createFileRoute("/api/public/telegram/poll")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const expected = process.env.CRON_SECRET;
  const url = new URL(request.url);
  const provided = request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getAdminDb();
  const { data: state } = await db.from("telegram_bot_state").select("update_offset").eq("id", 1).maybeSingle();
  const offset = state?.update_offset ?? 0;

  let updates: any[] = [];
  try {
    updates = await getUpdates(offset, 25);
  } catch (e) {
    console.error("[poll] getUpdates failed", e);
    return Response.json({ ok: false, error: String(e) }, { status: 502 });
  }

  let lastId = offset;
  let processed = 0;
  let failed = 0;

  for (const upd of updates) {
    lastId = Math.max(lastId, upd.update_id);
    // store raw for debugging / idempotency
    const { error: dupErr } = await db.from("telegram_updates_raw").insert({
      update_id: upd.update_id, payload: upd,
    });
    if (dupErr && !dupErr.message.includes("duplicate")) {
      console.warn("[poll] raw insert error", dupErr);
    }
    try {
      await processUpdate(upd);
      await db.from("telegram_updates_raw")
        .update({ processed_at: new Date().toISOString() })
        .eq("update_id", upd.update_id);
      processed++;
    } catch (e) {
      failed++;
      await db.from("telegram_updates_raw")
        .update({ processed_at: new Date().toISOString(), error: String(e) })
        .eq("update_id", upd.update_id);
    }
  }

  if (updates.length > 0) {
    await db.from("telegram_bot_state").update({
      update_offset: lastId + 1,
      last_polled_at: new Date().toISOString(),
    }).eq("id", 1);
  } else {
    await db.from("telegram_bot_state").update({ last_polled_at: new Date().toISOString() }).eq("id", 1);
  }

  return Response.json({ ok: true, processed, failed, total: updates.length, next_offset: lastId + 1 });
}
