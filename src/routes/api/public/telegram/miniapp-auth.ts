// Telegram Mini App auto-login: validates WebApp initData (HMAC-SHA256 with bot token),
// finds or creates an auth user linked to the telegram_id, returns a magiclink token_hash
// the client can exchange for a session via supabase.auth.verifyOtp.
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
  // Freshness: reject if older than 24h
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  return Object.fromEntries(params.entries());
}

export const Route = createFileRoute("/api/public/telegram/miniapp-auth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!botToken) return Response.json({ error: "Bot token not configured" }, { status: 500 });

        const { initData } = await request.json().catch(() => ({ initData: "" }));
        if (!initData || typeof initData !== "string") {
          return Response.json({ error: "Missing initData" }, { status: 400 });
        }

        const parsed = validateInitData(initData, botToken);
        if (!parsed) return Response.json({ error: "Invalid initData" }, { status: 401 });

        let tgUser: { id: number; username?: string; first_name?: string; last_name?: string } | null = null;
        try {
          tgUser = JSON.parse(parsed.user ?? "null");
        } catch {}
        if (!tgUser?.id) return Response.json({ error: "No user in initData" }, { status: 400 });

        const db = getAdminDb();
        const telegramId = tgUser.id;

        // Must be a registered family member
        const { data: member } = await db
          .from("family_members")
          .select("id, family_id, full_name, status, user_id")
          .eq("telegram_id", telegramId)
          .maybeSingle();

        if (!member) {
          return Response.json({
            error: "not_registered",
            message: "Avval botda /start bosib oilaga qo'shilishingiz kerak.",
          }, { status: 403 });
        }

        if (member.status !== "active") {
          return Response.json({
            error: "pending",
            message: "So'rovingiz hali admin tasdig'ini kutmoqda.",
          }, { status: 403 });
        }

        const email = `tg${telegramId}@telegram.local`;
        let userId = member.user_id as string | null;

        // Find or create auth user
        if (!userId) {
          const { data: existing } = await db
            .from("profiles")
            .select("user_id")
            .eq("telegram_id", telegramId)
            .maybeSingle();
          userId = existing?.user_id ?? null;
        }

        if (!userId) {
          const { data: created, error: createErr } = await db.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              telegram_id: telegramId,
              telegram_username: tgUser.username,
              full_name: member.full_name,
            },
          });
          if (createErr || !created.user) {
            return Response.json({ error: "Failed to create user", details: createErr?.message }, { status: 500 });
          }
          userId = created.user.id;
          await db.from("profiles").upsert({
            user_id: userId,
            email,
            display_name: member.full_name,
            telegram_id: telegramId,
            telegram_username: tgUser.username ?? null,
          }, { onConflict: "user_id" });
        }

        // Link member to user
        if (member.user_id !== userId) {
          await db.from("family_members").update({ user_id: userId }).eq("id", member.id);
        }

        // Ensure a 'member' role exists for this user in the family (idempotent).
        // Admins are assigned manually — this never overwrites an existing higher role.
        const { data: existingRole } = await db
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("family_id", member.family_id)
          .maybeSingle();
        if (!existingRole) {
          await db.from("user_roles").insert({
            user_id: userId,
            family_id: member.family_id,
            role: "member",
          });
        }

        // Generate a magiclink the client can verify to get a session
        const { data: link, error: linkErr } = await db.auth.admin.generateLink({
          type: "magiclink",
          email,
        });
        if (linkErr || !link?.properties?.hashed_token) {
          return Response.json({ error: "Failed to issue session", details: linkErr?.message }, { status: 500 });
        }

        return Response.json({
          ok: true,
          token_hash: link.properties.hashed_token,
          email,
        });
      },
    },
  },
});
