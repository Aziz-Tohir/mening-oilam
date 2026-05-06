## Muammo

Web orqali oila yaratganda, foydalanuvchi `families.owner_user_id` va `user_roles`da **superadmin** bo'ladi. Lekin:
- `profiles.telegram_id` bo'sh bo'lishi mumkin (web login Telegram ID'siz)
- `family_members.telegram_id` esa shunchaki form'da kiritilgan raqam (egasining haqiqiy Telegram ID'si bilan mos kelmasligi mumkin)

Natijada:
- **Bot /start** → `family_members WHERE telegram_id = userId` topilmaydi → "yangi user" oqimi ko'rsatiladi (a'zosiz)
- **Mini App** → `miniapp-auth.ts:51-62` xuddi shu tekshiruv → **403 not_registered** → "Avval botda /start bosib oilaga qo'shilishingiz kerak"

DB tasdiqladi: `Usmonovlar` oilasi, owner `Tohirjon Odilov` (tg=1633746526), lekin `profiles.telegram_id = NULL` → bog'lanish uzilgan.

## A) `src/server/telegramHandlers.server.ts` — `sendStartFlow` (≈396)

`family_members.telegram_id` bo'yicha topilmasa, qo'shimcha tekshiruv:
1. `profiles WHERE telegram_id = userId` → `profileUserId` olinadi
2. Agar profil mavjud bo'lsa: `families.owner_user_id = profileUserId` va `user_roles.user_id = profileUserId` orqali oilalarni topiladi
3. Topilganlar uchun `family_members` qatori yo'q bo'lsa — yaratiladi (`status:'active'`); bor bo'lsa-yu `telegram_id` boshqa — `telegram_id`ni haqiqiysiga yangilanadi (auto-link)
4. Birlashtirilgan ro'yxat bo'sh emas bo'lsa — `already_member` xabari

## B) `src/routes/api/public/telegram/miniapp-auth.ts` — same logic

`family_members WHERE telegram_id` topilmasa:
1. `profiles WHERE telegram_id` → `userId` olinadi
2. Agar `userId` topilsa: `families.owner_user_id = userId` yoki `user_roles WHERE user_id` topilsa — eng birinchi oilani olib `family_members` qatorini auto-link/insert qilish (`status:'active'`)
3. Shundan keyin standart `member` topilgan rejimga o'tib magiclink beriladi
4. Hech qanday bog'lanish topilmagandagina `403 not_registered` qaytariladi

## C) `src/server/families.functions.ts` — `createFamily`

`telegram_id` berilgan bo'lsa, `profiles.telegram_id` ni `userId` uchun **upsert** qilamiz (agar bo'sh bo'lsa) — kelajakda bu muammo qaytarilmasligi uchun.

## D) Backfill (mavjud Tohirjon uchun)

`profiles.telegram_id = 1633746526` ni `user_id = 7c645925-...` uchun yangilash. Bu **bir martalik data update** (`supabase--insert` orqali).

## Tegilmaydi

- RLS / migratsiya
- Mini App UI / flow
- Login forma

## Texnik tafsilot

```text
/start  → family_members.tg_id?  → not found
        → profiles.tg_id → user_id
        → families.owner_user_id OR user_roles
        → auto-create / auto-relink family_members row
        → already_member

miniapp-auth → bir xil mantiq, +magiclink
createFamily → profiles.telegram_id upsert (idempotent)
```
