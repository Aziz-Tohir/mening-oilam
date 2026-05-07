// Mini-app registration: user enters an invite_code; we create a join_request
// (status=awaiting_admin_approval) and notify family admins via Telegram.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac } from "crypto";
import { getAdminDb } from "@/server/db.server";

function validateInitData(initData: string, botToken: string): Record<string, string> | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  return Object.fromEntries(params.entries());
}

export const Route = createFileRoute("/api/public/telegram/miniapp-register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return Response.json({ error: "Bot token not configured" }, { status: 500 });

        const body = await request.json().catch(() => ({}));
        const initData: string = body?.initData ?? "";
        const inviteCode: string = String(body?.invite_code ?? "").trim().toUpperCase();
        if (!initData || !inviteCode) {
          return Response.json({ error: "missing", message: "initData yoki invite_code yo'q" }, { status: 400 });
        }

        const parsed = validateInitData(initData, botToken);
        if (!parsed) return Response.json({ error: "Invalid initData" }, { status: 401 });

        let tgUser: { id: number; username?: string; first_name?: string; last_name?: string } | null = null;
        try { tgUser = JSON.parse(parsed.user ?? "null"); } catch {}
        if (!tgUser?.id) return Response.json({ error: "no_user" }, { status: 400 });

        const db = getAdminDb();

        const { data: fam } = await db
          .from("families")
          .select("id, name, telegram_group_id")
          .eq("invite_code", inviteCode)
          .maybeSingle();
        if (!fam) {
          return Response.json({ error: "invalid_code", message: "Bunday kodli oila topilmadi" }, { status: 404 });
        }

        const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || `User ${tgUser.id}`;

        // If already an active member — short-circuit
        const { data: existingMember } = await db
          .from("family_members")
          .select("id, status")
          .eq("family_id", fam.id)
          .eq("telegram_id", tgUser.id)
          .maybeSingle();
        if (existingMember && (existingMember as any).status === "active") {
          return Response.json({ ok: true, already_member: true });
        }

        // Reuse pending join_request or create one
        const { data: existingReq } = await db
          .from("join_requests")
          .select("id, status")
          .eq("family_id", fam.id)
          .eq("applicant_telegram_id", tgUser.id)
          .in("status", ["awaiting_relative_choice", "awaiting_relative_confirm", "awaiting_admin_approval"])
          .maybeSingle();

        if (!existingReq) {
          const { error: insErr } = await db.from("join_requests").insert({
            family_id: fam.id,
            applicant_telegram_id: tgUser.id,
            applicant_username: tgUser.username ?? null,
            applicant_full_name: fullName,
            status: "awaiting_admin_approval",
          });
          if (insErr) return Response.json({ error: "insert_failed", message: insErr.message }, { status: 500 });
        }

        // Notify family admins (best-effort)
        try {
          const { data: roleRows } = await db.from("user_roles")
            .select("user_id").eq("family_id", fam.id).in("role", ["admin", "superadmin"]);
          const userIds = (roleRows ?? []).map(r => r.user_id);
          if (userIds.length > 0) {
            const { data: adminMembers } = await db.from("family_members")
              .select("telegram_id").eq("family_id", fam.id).in("user_id", userIds);
            const lovable = process.env.LOVABLE_API_KEY;
            const tgKey = process.env.TELEGRAM_API_KEY;
            if (lovable && tgKey) {
              const text = `🔔 Mini-app orqali yangi a'zo so'rovi:\n\n👤 ${fullName} ${tgUser.username ? `(@${tgUser.username})` : ""}\n🆔 ${tgUser.id}\n👨‍👩‍👧 Oila: ${fam.name}\n\nDashboard → So'rovlar bo'limidan tasdiqlang.`;
              for (const m of adminMembers ?? []) {
                if (!m.telegram_id) continue;
                await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${lovable}`,
                    "X-Connection-Api-Key": tgKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ chat_id: m.telegram_id, text }),
                }).catch(() => {});
              }
            }
          }
        } catch (e) { console.warn("[miniapp-register] notify admins failed", e); }

        await db.from("action_logs").insert({
          family_id: fam.id,
          actor_telegram_id: tgUser.id,
          action: "miniapp_join_request",
          details: { invite_code: inviteCode, full_name: fullName, username: tgUser.username },
        });

        return Response.json({ ok: true, family_name: fam.name });
      },
    },
  },
});
