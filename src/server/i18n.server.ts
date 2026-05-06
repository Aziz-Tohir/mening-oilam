// Bot i18n helper. Lotin → krill transliteratsiya orqali, asosiy manba: uz JSON.
import uz from "./locales/uz.json";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import { latinToCyrillic } from "@/utils/transliteration";

export type Lang = "uz" | "uz_cyrl" | "ru" | "en";

const dicts: Record<Exclude<Lang, "uz_cyrl">, Record<string, string>> = { uz, ru, en };

export function t(key: string, lang: Lang = "uz", vars?: Record<string, string | number>): string {
  let raw: string;
  if (lang === "uz_cyrl") {
    raw = (dicts.uz as any)[key] ?? key;
    raw = latinToCyrillic(raw);
  } else {
    raw = (dicts[lang] as any)[key] ?? (dicts.uz as any)[key] ?? key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      raw = raw.split(`{${k}}`).join(String(v));
    }
  }
  return raw;
}

export async function getUserLang(db: any, telegramId: number, familyId?: string | null): Promise<Lang> {
  // Avval foydalanuvchining shaxsiy tili
  const { data: prof } = await db
    .from("profiles")
    .select("language")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (prof?.language) return prof.language as Lang;
  // Keyin oila tili
  if (familyId) {
    const { data: fs } = await db
      .from("family_settings")
      .select("language")
      .eq("family_id", familyId)
      .maybeSingle();
    if (fs?.language) return fs.language as Lang;
  }
  return "uz";
}
