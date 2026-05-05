// Telegram webhook endpoint — receives updates instantly.
// Secured via X-Telegram-Bot-Api-Secret-Token derived from TELEGRAM_API_KEY.
import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { getAdminDb } from "@/server/db.server";
import { processUpdate } from "@/server/telegramHandlers.server";

function deriveSecret(apiKey: string): string {
  return createHash("sha256").update(`telegram-webhook:${apiKey}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.TELEGRAM_API_KEY;
        if (!apiKey) return new Response("Not configured", { status: 500 });

        const expected = deriveSecret(apiKey);
        const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json();
        const db = getAdminDb();

        // Idempotency: skip if already stored
        const { error: dupErr } = await db.from("telegram_updates_raw").insert({
          update_id: update.update_id,
          payload: update,
        });
        if (dupErr && dupErr.message.includes("duplicate")) {
          return Response.json({ ok: true, duplicate: true });
        }

        try {
          await processUpdate(update);
          await db.from("telegram_updates_raw")
            .update({ processed_at: new Date().toISOString() })
            .eq("update_id", update.update_id);
        } catch (e) {
          console.error("[webhook] process error", e);
          await db.from("telegram_updates_raw")
            .update({ processed_at: new Date().toISOString(), error: String(e) })
            .eq("update_id", update.update_id);
          // Return 200 anyway so Telegram doesn't retry forever
        }

        return Response.json({ ok: true });
      },
    },
  },
});
