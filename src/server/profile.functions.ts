import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { tgCall } from "./telegram.server";

export const getMyMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("family_members")
      .select("id, family_id, full_name, birth_date, gender, phone, bio, photo_url, photo_is_private, username, telegram_id, status, sentiment_opt_out, families:family_id(id, name)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { memberships: data ?? [] };
  });

const PatchSchema = z.object({
  full_name: z.string().trim().min(1).max(128).optional(),
  birth_date: z.string().nullable().optional(),
  gender: z.enum(["male", "female"]).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  bio: z.string().max(1000).nullable().optional(),
  photo_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  photo_is_private: z.boolean().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    memberId: z.string().uuid(),
    patch: PatchSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS guarantees only own record; double-check user_id match
    const { error } = await supabase
      .from("family_members")
      .update(data.patch as never)
      .eq("id", data.memberId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Fetch the user's Telegram profile photo and upload to the avatars bucket.
export const importTelegramPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: member, error: mErr } = await supabase
      .from("family_members")
      .select("id, telegram_id")
      .eq("id", data.memberId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!member?.telegram_id) throw new Error("Telegram ID topilmadi");

    const photos: any = await tgCall("getUserProfilePhotos", { user_id: member.telegram_id, limit: 1 });
    const photoSizes = photos?.photos?.[0];
    if (!photoSizes || photoSizes.length === 0) throw new Error("Telegram'da profil rasmingiz yo'q");
    const best = photoSizes[photoSizes.length - 1];

    const fileInfo: any = await tgCall("getFile", { file_id: best.file_id });
    const filePath = fileInfo?.file_path;
    if (!filePath) throw new Error("Telegram fayl yo'lini olib bo'lmadi");

    const lovable = process.env.LOVABLE_API_KEY!;
    const tg = process.env.TELEGRAM_API_KEY!;
    const dl = await fetch(`https://connector-gateway.lovable.dev/telegram/file/${filePath}`, {
      headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": tg },
    });
    if (!dl.ok) throw new Error(`Telegram'dan yuklab bo'lmadi [${dl.status}]`);
    const bytes = new Uint8Array(await dl.arrayBuffer());

    const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
    const objectKey = `${userId}/tg-${member.id}-${Date.now()}.${ext}`;

    // Upload via service-role (bypass RLS, but key is server-only)
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { error: upErr } = await admin.storage.from("avatars").upload(objectKey, bytes, {
      contentType: ext === "png" ? "image/png" : "image/jpeg",
      upsert: true,
    });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = admin.storage.from("avatars").getPublicUrl(objectKey);
    const photo_url = pub.publicUrl;

    const { error: updErr } = await supabase
      .from("family_members")
      .update({ photo_url } as never)
      .eq("id", member.id)
      .eq("user_id", userId);
    if (updErr) throw new Error(updErr.message);

    return { photo_url };
  });

