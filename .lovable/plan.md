
# Shajara (Family Hub) — Bosqich 1 (MVP) Plani

Telegram bot + web admin panel. Multi-family arxitektura. Lovable Cloud (Supabase) + TanStack Start + TypeScript. Keyingi bosqichlarda Mini App, vizual shajara, tadbirlar va statistika qo'shiladi.

## Bu bosqichda nima qilinadi

1. **Telegram bot** — `/start` orqali oilaga qo'shilish, ko'p bosqichli xavfsiz onboarding, asosiy admin komandalari.
2. **Guruh moderatsiyasi** — kirdi-chiqdi xabarlarini o'chirish, integratsiya qilingan botlarning ortiqcha xabarlarini tozalash.
3. **Web admin paneli** — login, oila yaratish, foydalanuvchilar ro'yxati, kutayotgan so'rovlar, sozlamalar, qarindoshlik aloqalarini qo'shish.
4. **Telegram polling worker** — webhook o'rniga `getUpdates` long-polling (Lovable connector cheklovi). Cron orqali har minutda ishga tushadi.

Bosqich 2 (Mini App, vizual shajara, "Kim kimga kim?" kalkulyatori) va Bosqich 3 (statistika, gamifikatsiya, backup) keyingi turlarda qilinadi.

## Texnologiya moslashuvi (TZ → Lovable)

| TZ | Lovable'da |
|---|---|
| Python/FastAPI backend | TanStack Start `createServerFn` + server routes |
| python-telegram-bot | Telegram connector (gateway orqali REST) |
| PostgreSQL 15+ | Lovable Cloud (Supabase Postgres) |
| Redis kesh | Postgres (kichik MVP uchun yetarli) |
| Docker / VPS | Lovable hosting (serverless Worker) |
| Webhook | `getUpdates` long-polling + cron (gateway webhook'ni qo'llamaydi) |
| APScheduler/Celery | Tashqi cron (project--{id}.lovable.app stable URL) |

## Arxitektura

```text
Telegram foydalanuvchi
        │
        ▼
   Telegram API
        │
        ▼  (long-poll har minutda)
 /api/public/telegram/poll  ──▶  telegram_messages (DB)
        │                              │
        │                              ▼
        │                       handler dispatcher
        │                       (komanda → server fn)
        ▼
 Telegram connector gateway
 (sendMessage, getChatMember, ...)

Web admin panel (React) ──▶ createServerFn ──▶ Supabase (RLS)
```

## Ma'lumotlar bazasi (Bosqich 1 minimumi)

`families`, `users`, `relationships`, `join_requests`, `bot_integrations`, `settings`, `action_logs`, `admin_notifications` jadvallari TZ bo'yicha. `events`, `messages_stats`, `helps`, `memories` keyingi bosqichlarda.

Qo'shimcha:
- `user_roles` jadvali (Lovable xavfsizlik qoidasi — rollar `users`'da emas, alohida jadvalda) + `has_role()` security definer funksiyasi.
- `telegram_bot_state` (polling offset uchun).
- `telegram_updates_raw` (qayta ishlanishi kutilayotgan xom update'lar).

Hamma jadvallarda RLS yoqiladi:
- `families`: a'zolar o'z oilasini ko'radi; admin tahrirlaydi.
- `users`: bir oilaning a'zolari bir-birini ko'radi; o'zini tahrirlaydi; admin hammasini.
- `join_requests`, `action_logs`, `admin_notifications`: faqat admin/superadmin.
- Bot service operatsiyalari uchun `supabaseAdmin` (service role) — server function'larda ishlatiladi.

## Telegram bot oqimi (xavfsiz onboarding)

```text
1. Yangi odam → /start (botga DM)
2. Bot: "Siz qaysi oilaga? Qarindoshingiz username yoki contact"
3. Foydalanuvchi javob beradi → join_requests jadvaliga yoziladi
4. Bot tasdiqlovchiga DM: "Falonchi sizga kim?" + tugmalar
5. Tasdiqlovchi qarindoshlik darajasini tanlaydi
6. Adminga DM: "Tasdiqlash / Rad etish" tugmalari
7. Admin tasdiqlasa:
   - users jadvaliga 'active' status bilan qo'shiladi
   - relationships jadvaliga aloqa qo'shiladi
   - guruhga invite link yuboriladi
   - guruhga qisqa xabar (auto-delete sozlamasi bo'yicha)
8. Admin 24/48 soat ichida javob bermasa — settings'dagi qoida bo'yicha auto-approve/reject
```

Callback'lar `callback_data` orqali tugmalar bilan boshqariladi (`approve:<request_id>`, `reject:<request_id>`, `rel:<request_id>:<type>`).

## Admin panel (web)

Sahifalar (TanStack Start route'lari):
- `/` — landing (Shajara loyihasi haqida + "Kirish" tugmasi)
- `/login` — Lovable Cloud auth (email/parol + Google)
- `/dashboard` — oila tanlash, qisqa statistika
- `/dashboard/members` — a'zolar ro'yxati, qidiruv, blok/blokdan chiqarish, tahrirlash
- `/dashboard/requests` — kutayotgan join so'rovlari, tasdiq/rad
- `/dashboard/relationships` — qarindoshlik aloqalarini qo'lda qo'shish/o'chirish
- `/dashboard/bot-integrations` — boshqa botlarni qo'shish + rejim tanlash
- `/dashboard/settings` — feature toggles, til, auto-delete, auto-approve timeout
- `/dashboard/logs` — action_logs ko'rish
- `/dashboard/family/new` — yangi oila yaratish (telegram_group_id ulash)

UI: shadcn komponentlari (allaqachon mavjud), dark/light tema, responsive.

## Telegram polling worker

`/api/public/telegram/poll` server route — har chaqirilganda 50 sekund long-poll loop ishlaydi:
1. `telegram_bot_state.update_offset` o'qiladi
2. Gateway'dan `getUpdates` chaqiriladi
3. Har bir update `telegram_updates_raw` jadvaliga yoziladi
4. Update turi bo'yicha handler chaqiriladi (DM komanda, callback, group event)
5. Offset yangilanadi

Cron: tashqi service (yoki Lovable scheduler) `project--<id>.lovable.app/api/public/telegram/poll` ni har minutda chaqiradi. Endpoint webhook secret bilan himoyalanadi.

## Texnik tafsilotlar

**Server functions joylashuvi:**
- `src/server/families.functions.ts` — oila CRUD
- `src/server/members.functions.ts` — a'zolar boshqaruvi
- `src/server/joinRequests.functions.ts` — onboarding flow
- `src/server/relationships.functions.ts` — aloqalar
- `src/server/telegram.server.ts` — gateway helper'lari (sendMessage, kickMember, getChat...)
- `src/server/telegramHandlers.server.ts` — update dispatcher
- `src/server/auth-middleware.ts` — `requireSupabaseAuth` + `requireFamilyAdmin`

**Sirlar/secrets:**
- `LOVABLE_API_KEY` — avtomatik
- `TELEGRAM_API_KEY` — Telegram connector orqali
- `TELEGRAM_WEBHOOK_SECRET` — polling endpoint himoyasi uchun (qo'lda qo'shiladi)
- `BOT_USERNAME` — bot username (sozlash uchun)

**Qarindoshlik turlari (enum):** `father`, `mother`, `child_son`, `child_daughter`, `brother`, `sister`, `husband`, `wife`, `uncle_paternal` (amaki), `uncle_maternal` (tog'a), `aunt_paternal` (amma), `aunt_maternal` (xola), `cousin_*`, `father_in_law`, `mother_in_law`, `son_in_law` (kuyov), `daughter_in_law` (kelin).

**Logging:** har bir muhim harakat `action_logs`'ga yoziladi (kim, qachon, nima qildi).

## Kerakli qadamlar

1. Lovable Cloud yoqish (Supabase) — sizdan tasdiq so'rayman
2. Telegram connector ulash — sizdan bot tokeni so'rayman (BotFather'dan)
3. Migration: barcha jadvallar + RLS + `has_role` funksiyasi
4. Auth tizimi (email/parol + Google) + superadmin qilish flow
5. Telegram helper layer (gateway wrapper)
6. Polling endpoint + handler dispatcher
7. Bot oqimlari: `/start`, onboarding 4-bosqichi, callback'lar
8. Admin panel sahifalari
9. Cron sozlash bo'yicha qisqa qo'llanma

## Bu bosqichda QILINMAYDI (keyingi turlarda)

- Mini App (TWA), vizual shajara diagrammasi, "Kim kimga kim?" kalkulyatori (Bosqich 2)
- Tadbirlar, tug'ilgan kun eslatmalari, RSVP (Bosqich 2)
- Statistika dashboard, reyting, gamifikatsiya, "yordam so'rovlari", xotiralar arxivi (Bosqich 3)
- Anti-spam AI, sentiment analiz (Bosqich 3)
- Backup avtomatlashtirish (Bosqich 3)
- Ko'p tilli interfeys (avval o'zbek lotin)

## Eslatmalar va cheklovlar

- **Webhook yo'q:** Telegram connector gateway webhook'ni qo'llamaydi, shuning uchun polling. Xabarlarga javob 0–60 sekund kechikishi mumkin.
- **Bot guruhga admin huquqlari bilan qo'shilishi shart** (a'zolarni o'chirish, xabar tozalash, invite link yaratish uchun).
- **Boshqa bot xabarlarini tahrirlash** Telegram API'da cheklangan — TZ'dagi yechim (forwardMessage + caption tag) qo'llaniladi.
- **VPS kerak emas** — hammasi Lovable'da. Cron uchun bepul tashqi service (cron-job.org) yetarli.

Tasdiqlasangiz, Lovable Cloud va Telegram connector'ni ulashdan boshlayman.
