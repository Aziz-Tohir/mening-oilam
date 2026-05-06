// Shared avatar helpers — server-only, uses service-role for storage.
import { createClient } from "@supabase/supabase-js";
import { tgCall } from "./telegram.server";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function downloadTelegramFile(filePath: string): Promise<Uint8Array> {
  const lovable = process.env.LOVABLE_API_KEY!;
  const tg = process.env.TELEGRAM_API_KEY!;
  const dl = await fetch(`https://connector-gateway.lovable.dev/telegram/file/${filePath}`, {
    headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": tg },
  });
  if (!dl.ok) throw new Error(`Telegram'dan yuklab bo'lmadi [${dl.status}]`);
  return new Uint8Array(await dl.arrayBuffer());
}

async function uploadAvatar(folder: string, prefix: string, filePath: string, bytes: Uint8Array): Promise<string> {
  const ext = (filePath.split(".").pop() || "jpg").toLowerCase();
  const key = `${folder}/${prefix}-${Date.now()}.${ext}`;
  const a = admin();
  const { error } = await a.storage.from("avatars").upload(key, bytes, {
    contentType: ext === "png" ? "image/png" : "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return a.storage.from("avatars").getPublicUrl(key).data.publicUrl;
}

/** Best-effort import of the user's Telegram profile photo into the avatars bucket. */
export async function importTelegramPhotoForMember(opts: {
  telegramId: number;
  memberId: string;
  userId?: string | null;
  overwrite?: boolean;
}): Promise<string | null> {
  const a = admin();

  if (!opts.overwrite) {
    const { data: cur } = await a.from("family_members").select("photo_url").eq("id", opts.memberId).maybeSingle();
    if (cur?.photo_url) return cur.photo_url;
  }

  try {
    const photos: any = await tgCall("getUserProfilePhotos", { user_id: opts.telegramId, limit: 1 });
    const sizes = photos?.photos?.[0];
    if (!sizes || sizes.length === 0) return null;
    const best = sizes[sizes.length - 1];
    const fileInfo: any = await tgCall("getFile", { file_id: best.file_id });
    const filePath = fileInfo?.file_path;
    if (!filePath) return null;

    const bytes = await downloadTelegramFile(filePath);
    const folder = opts.userId ?? `tg-${opts.telegramId}`;
    const url = await uploadAvatar(folder, `tg-${opts.memberId}`, filePath, bytes);

    await a.from("family_members").update({ photo_url: url } as never).eq("id", opts.memberId);
    return url;
  } catch (e) {
    console.error("[avatar] importTelegramPhotoForMember failed", e);
    return null;
  }
}

/** Upload a Telegram-sent file (photo from chat) and set as the member's avatar. */
export async function setMemberAvatarFromTelegramFile(opts: {
  fileId: string;
  memberId: string;
  telegramId: number;
  userId?: string | null;
}): Promise<string> {
  const fileInfo: any = await tgCall("getFile", { file_id: opts.fileId });
  const filePath = fileInfo?.file_path;
  if (!filePath) throw new Error("Telegram fayl yo'lini olib bo'lmadi");
  const bytes = await downloadTelegramFile(filePath);
  const folder = opts.userId ?? `tg-${opts.telegramId}`;
  const url = await uploadAvatar(folder, `bot-${opts.memberId}`, filePath, bytes);
  const a = admin();
  const { error } = await a.from("family_members").update({ photo_url: url } as never).eq("id", opts.memberId);
  if (error) throw new Error(error.message);
  return url;
}
