// Auto-approve / auto-reject pending join requests based on per-family timeouts.
import { createFileRoute } from "@tanstack/react-router";
import { getAdminDb } from "@/server/db.server";
import { sendMessage } from "@/server/telegram.server";
import { approveJoinRequest } from "@/server/telegramHandlers.server";

async function handle(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") ?? request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const db = getAdminDb();
  const { data: settingsRows } = await db
    .from("family_settings")
    .select("family_id, join_request_auto_approve_timeout_hours, join_request_auto_reject_timeout_hours");

  const now = Date.now();
  let approved = 0, rejected = 0;

  for (const s of settingsRows ?? []) {
    const approveH = s.join_request_auto_approve_timeout_hours ?? 0;
    const rejectH = s.join_request_auto_reject_timeout_hours ?? 0;
    if (approveH <= 0 && rejectH <= 0) continue;

    const { data: reqs } = await db
      .from("join_requests")
      .select("*")
      .eq("family_id", s.family_id)
      .eq("status", "awaiting_admin_approval");

    for (const req of reqs ?? []) {
      const ageH = (now - new Date(req.created_at).getTime()) / 3600000;
      try {
        if (rejectH > 0 && ageH >= rejectH) {
          await db.from("join_requests").update({
            status: "rejected", decided_at: new Date().toISOString(), reject_reason: "Auto-rad (vaqt o'tdi)",
          }).eq("id", req.id);
          await sendMessage(req.applicant_telegram_id, "So'rovingiz vaqt o'tib avtomatik rad etildi.").catch(() => {});
          rejected++;
        } else if (approveH > 0 && ageH >= approveH) {
          await approveJoinRequest(req);
          approved++;
        }
      } catch (e) {
        console.error("[cron] process join req failed", req.id, e);
      }
    }
  }

  return Response.json({ ok: true, approved, rejected });
}

export const Route = createFileRoute("/api/public/cron/process-join-requests")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});
