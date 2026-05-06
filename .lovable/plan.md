# Takomillashtirilgan Sprint Rejasi (PDF asosida)

PDF'dagi tavsiyalarni hisobga olib, oldingi reja quyidagicha qayta tuzildi. Bosqichma-bosqich, **Sprint A → B → C** tartibida boraman. Har bir bosqich oxirida to'xtab natijani ko'rsataman.

---

## SPRINT A — Bosqich 1 yakunlash

### A1. Ko'p tillilik (i18n) — 4 til to'liq

**Fayllar:**
- `src/utils/transliteration.ts` — lotin↔krill mexanik konverter (alohida util)
- `src/server/i18n.server.ts` — `t(key, lang, vars)` helper, JSON yuklash
- `src/server/locales/{uz,uz_cyrl,ru,en}.json` — barcha bot xabarlari, **do'stona/oilaviy ohang** ("Oilamizga xush kelibsiz!" uslubida)
- DB: `profiles.language` qo'shish (shaxsiy til, `family_settings.language` dan ustun)
- `src/routes/dashboard.settings.tsx` — til tanlash (oila + shaxsiy)
- `telegramHandlers.server.ts` `/start` — yangi user uchun til tanlash inline tugmalari

### A2. Begona bot media boshqaruvi

**PDF muhim eslatma:** `forwardMessage` `caption`/`reply_to` qo'shishga ruxsat bermaydi. Shuning uchun **download → reupload** yondashuvi:

- Bot xabarini aniqlash: `message.from.is_bot === true` va `message.via_bot` tekshiruvi
- `getFile` → fayl yuklab olish → `sendPhoto`/`sendVideo`/`sendDocument` qayta yuborish
- `caption` ga: "[Ism] oilamiz bilan ulashdi! 📸"
- Asl xabar: `deleteMessage`
- DB: `family_settings.manage_foreign_bot_media boolean default false` (PDF tavsiyasi: aniqroq nom)
- Settings UI'da toggle

### A3. Botda "Yangi oila yaratish" — Aqlli onboarding

**Kontekstga qarab `/start` 3 holat:**

1. **Deep link** (`/start family_<INVITE_CODE>`) → to'g'ridan-to'g'ri qo'shilish jarayoni
2. **Mavjud a'zo** (active + family_id bor) → o'z oilasining asosiy menyusi
3. **Yangi user** → 2 tugma: "🏠 Yangi oila yaratish" / "👥 Mavjud oilaga qo'shilish"

**Wizard state:**
- DB: `bot_sessions` jadvali (`telegram_id`, `step`, `data jsonb`, `updated_at`)
- "Yangi oila": oila nomi → `families` insert + `user_roles(superadmin)` + invite_code → guruh yaratish bo'yicha **bosqichma-bosqich yo'riqnoma** + "Botni guruhga admin sifatida qo'shish" havolasi (`t.me/<bot>?startgroup=...`)

---

## SPRINT B — Bosqich 2 yakunlash

### B1. Tug'ilgan kun tabriklash + hisoblagich

- DB: `birthday_greetings (id, family_id, birthday_member_id FK, greeter_telegram_id, greeter_member_id FK nullable, year, created_at)`
- `daily-reminders.ts` cron: tug'ilgan kun xabariga "🎉 Tabriklash" inline tugma
- Callback: `birthday_greetings` insert + guruhga: **"[Tabriklagan] [Tug'ilgan kun egasi]ni tabrikladi! 🎉 Bugun uni N kishi tabrikladi!"**
- Profil/dashboard: yillik tabriklar soni ko'rsatkichi

### B2. Shajara JSON Eksport

- `src/server/tree.functions.ts` — `exportFamilyTreeJson(familyId)`:
  - A'zolar (full_name, birth_date, gender, photo_url, telefon **faqat private bo'lmasa**)
  - Aloqalar
  - Faqat `admin`/`superadmin` (server-side rol tekshiruvi)
- Fayl nomi: `shajara_<family_slug>_<YYYY-MM-DD>.json`
- `dashboard.tree.tsx` — "JSON yuklab olish" tugmasi

---

## SPRINT C — Bosqich 3 va Xavfsizlik

### C1. Yillik Nominatsiyalar
- DB: `nominations (family_id, year, category, winner_member_id, score, created_at)` + `nomination_category` enum
- Cron: **1-yanvar 00:00** (PDF tuzatishi — yil yakuni)
- Kategoriyalar va manbai:
  - "Eng faol" → `messages_stats` 1 yillik sum
  - "Oila tayanchi" → `/yordam` javoblari
  - "Yil quvonchi" → `sentiment_score` (C6)
  - "Eng yaxshi tabriklovchi" → `birthday_greetings` count
- Guruhga chiroyli e'lon, dashboard "Awards" sahifasi, profilga medal ikonkasi

### C2. Xotiralar Arxivi
- DB: `memories (id, family_id, telegram_file_id, media_type, caption, tagged_member_ids bigint[], created_by, created_at)` — PDF tavsiyasi: `storage_url` olib tashlanadi
- Bot: guruh media + `#xotira` → DB ga
- `dashboard.memories.tsx` — galereya, sana/a'zo filter, izoh, admin o'chirish

### C3. DB Backup
- **PDF tavsiyasi: pg_dump afzal.** Worker'da `pg_dump` ishlamaydi, shuning uchun:
  - **Birinchi versiya:** asosiy jadvallarning JSON dump (kun davomida o'zgargan, ≤10MB)
  - **Hujjatlash:** to'liq `pg_dump` uchun tashqi cron (GitHub Actions / Supabase'ning o'z backup) tavsiyasi README'ga
- `family_settings.backup_telegram_chat_id` + `family_settings.backup_frequency` (daily/weekly)
- `/api/public/cron/db-backup` — service role bilan dump → `sendDocument`

### C4. Log + Admin notification kanallar
- `family_settings.log_channel_id`, `admin_notification_channel_id`
- `logToChannel(familyId, level, text)` — `info|warning|error|audit` darajalar
- Admin DM fallback (PDF tavsiyasi)

### C5. Gender / kengaytirilgan targeting
- `bot_broadcasts.target` enum: + `females`, `males`, `parents`, `age_18_30` h.k.
- `sendBroadcast` filter mantiqi
- Yuborilgan/ko'rilgan stat (basic delivery count)

### C6. Sentiment scoring
- Lovable AI `google/gemini-2.5-flash-lite` batch (kunlik cron)
- `messages_stats.sentiment_score real` qo'shish
- Dashboard: oila kayfiyat grafigi (recharts line)
- Maxfiylik eslatmasi settings'da

### C7. Rate limiting
- DB: `rate_limit_log (telegram_id, family_id, window_start, count)` (Redis o'rniga DB — workerda Redis yo'q)
- 60s > 30 update → 5 daqiqa blok + foydalanuvchiga ogohlantirish + adminga signal
- Global + oila darajasida

### C8. 2FA (ixtiyoriy)
- Supabase Auth MFA (TOTP) yoqish
- `dashboard.settings.tsx` — "2FA yoqish" sahifasi
- Superadminlar uchun majburiy qilish opsiyasi
- Recovery codes ko'rsatish

---

## Bajarish tartibi

Sprint A → ko'rsataman → Sprint B → ko'rsataman → Sprint C (C1-C4 birinchi to'lqin, keyin C5-C8).

Tasdiqlasangiz, **Sprint A** dan boshlayman.