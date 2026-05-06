## Maqsad

Beshta xususiyatni qo'shish: (1) join-request auto-approve/reject cron, (2) quiet-hours respect daily-reminders'da, (3) invite code + deep linking, (4) /yordam komandasi, (5) statistika va reyting.

---

### 1) Auto-approve/reject cron (`/api/public/cron/process-join-requests`)

Yangi route fayl: `src/routes/api/public/cron/process-join-requests.ts`

- Har 30 daqiqada chaqiriladi (pg_cron orqali sozlanadi)
- `families` ↔ `family_settings` JOIN — har bir oila uchun:
  - `awaiting_admin_approval` statusdagi `join_requests`larni o'qiydi
  - `now() - created_at > auto_approve_timeout_hours` → `approveJoinRequest(req)` (mavjud helper'ni `telegramHandlers.server.ts`'dan eksport qilamiz)
  - `now() - created_at > auto_reject_timeout_hours` → status=`rejected`, applicant'ga DM
- 0 = o'chirilgan
- `CRON_SECRET` bilan himoyalangan
- pg_cron job: `select cron.schedule('process-join-requests','*/30 * * * *', $$ ... $$)` (insert tool orqali)

### 2) Quiet hours `daily-reminders`'da

`src/routes/api/public/cron/daily-reminders.ts`'ni o'zgartiramiz:

- `family_settings`'dan `quiet_hours_start`, `quiet_hours_end`, `birthday_notify_time` o'qiymiz
- Hozirgi vaqt quiet-hours ichida bo'lsa — ushbu oilani **shu chaqiruvda o'tkazib yuboramiz** (cron qayta urinib yuboradi). Time-zone: server UTC; oddiy soat-daqiqa solishtirish (cross-midnight holatini ham qo'llab-quvvatlaymiz: `start > end` bo'lsa wrap)
- Tug'ilgan kun yuborishni `birthday_notify_time` ± 30 min oynasida bajaramiz, agar bu maydon o'rnatilgan bo'lsa

### 3) Invite code + deep linking

#### DB migration:
- `families`'ga `invite_code text unique` qo'shamiz
- Mavjud oilalarga random 8-belgi code generate qilamiz (migration ichida `update`)

#### Server:
- `src/server/families.functions.ts`: `regenerateInviteCode({familyId})` server function — adminlarga
- `src/server/telegramHandlers.server.ts` `handleMessage`'da `/start fam_<CODE>` payload'ni parse qilamiz:
  - `text.startsWith("/start ")` bo'lsa → payload'ni olamiz
  - `fam_XXXXXXXX` formatida bo'lsa → `families.invite_code = XXXXXXXX` orqali topamiz
  - Topilsa → `startJoinRequest(userId, from, fam.id, fam.name)` to'g'ridan-to'g'ri (oilalar ro'yxatini ko'rsatishni o'tkazib yuboramiz)

#### UI:
- `dashboard.settings.tsx`'da yangi "Taklif" kartochkasi:
  - Invite link ko'rsatish: `https://t.me/<BOT_USERNAME>?start=fam_<CODE>`
  - "Nusxalash" tugmasi
  - "Yangi kod yaratish" tugmasi (`regenerateInviteCode`)
- `BOT_USERNAME` env'ni server function orqali qaytaramiz

### 4) /yordam komandasi

`src/server/telegramHandlers.server.ts`:

- Private chat'da `/yordam <matn>` → 
  - foydalanuvchining oila(lari)ni topadi
  - har bir oila guruhiga: `🆘 Yordam so'rovi:\n${user.full_name}: ${matn}` yuboradi
  - foydalanuvchiga: "✅ Yordam so'rovingiz oila guruhi(lari)ga yuborildi."
- Bo'sh matn bo'lsa: "Foydalanish: /yordam <muammoyingiz>"
- `/help` matnida `/yordam` ham eslatamiz

### 5) Statistika va Reyting

#### DB migration: `messages_stats` jadvali

```sql
create table public.messages_stats (
  id bigserial primary key,
  family_id uuid not null,
  member_id uuid,
  telegram_id bigint,
  message_date date not null,
  messages_count int not null default 0,
  unique (family_id, telegram_id, message_date)
);
create index on public.messages_stats(family_id, message_date);
-- RLS: members SELECT via is_family_member; deny insert/update/delete to clients (admin only via service role)
```

#### Tracking (`moderation.server.ts` yoki `telegramHandlers.server.ts`):
Group message handler oxirida (moderatsiya o'tmasa) — admin client orqali:
```ts
upsert with on_conflict (family_id, telegram_id, message_date) - increment messages_count
```
Telegram_id orqali `family_members`'dan `member_id` topishga harakat qilamiz (bo'lmasa null).

#### Server function: `src/server/stats.functions.ts`
- `getFamilyStats({familyId, days=30})` — top 10 a'zo (sum), kunlik trend, jami xabarlar
- `getMyRank({familyId})` — joriy foydalanuvchi reytingdagi o'rni

#### UI: `src/routes/dashboard.stats.tsx` (yangi tab)
- Top 10 jadval (full_name, messages_count, badge: 🥇🥈🥉)
- Oxirgi 30 kun chizmasi (recharts mavjud — bar chart)
- Family selector

`dashboard.tsx` navigation'iga "📊 Statistika" linki qo'shamiz, `routeTree.gen.ts` avto-yangilanadi.

---

## Texnik tafsilotlar

- `approveJoinRequest` hozir `telegramHandlers.server.ts` ichida private. Cron ishlatishi uchun **export** qilamiz.
- pg_cron jobini `insert` tool orqali sozlash (migration emas — secret-bog'liq URL).
- Quiet hours bo'lsa, daily-reminders cron'ni 1 soatda bir bor o'rniga ko'proq chaqirish (masalan har 30 daqiqada) tavsiya etamiz; lekin cron sozlamasini o'zgartirmaymiz — faqat skip mantiqini qo'shamiz.
- `messages_stats` upsert'ni admin (service role) client bilan qilamiz.
- Invite code generation: `crypto.randomBytes(4).toString('hex').toUpperCase()`.

## Fayllar

**Yangi:**
- `src/routes/api/public/cron/process-join-requests.ts`
- `src/routes/dashboard.stats.tsx`
- `src/server/stats.functions.ts`
- 2 ta migration: `families.invite_code`, `messages_stats`

**O'zgaradi:**
- `src/routes/api/public/cron/daily-reminders.ts` (quiet hours)
- `src/server/telegramHandlers.server.ts` (deep link, /yordam, message stats tracking, export approveJoinRequest)
- `src/server/families.functions.ts` (regenerateInviteCode, getBotUsername)
- `src/routes/dashboard.settings.tsx` (Invite kartochkasi)
- `src/routes/dashboard.tsx` (Statistika nav)

## Tasdiqlanganidan keyin pg_cron sozlanadi

```sql
select cron.schedule('process-join-requests', '*/30 * * * *', $$
  select net.http_post(
    url:='https://mening-oilam.lovable.app/api/public/cron/process-join-requests?secret=<CRON_SECRET>',
    headers:='{"Content-Type":"application/json"}'::jsonb,
    body:='{}'::jsonb
  );
$$);
```
