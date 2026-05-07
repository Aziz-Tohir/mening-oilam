## Muammoning ildizi

- `families` jadvalida `telegram_group_id` `NULL` (ikkala oila uchun ham).
- `action_logs` da bor: bot 2026-05-07 10:52 da `Weekand` guruhga `member` sifatida qo'shilgan, `chat_id = -1002555325571`.
- `handleMyChatMember` (telegramHandlers.server.ts:68-82) bot guruhga qo'shilganda faqat `action_logs`ga yozadi, hech qaysi oilaga bog'lamaydi.
- `?startgroup=<CODE>` parametri Telegram tomonidan `my_chat_member` event'iga **uzatilmaydi** — bu Telegram API cheklovi. Payload faqat privat chatdagi `/start` ga keladi.
- Natija: bot guruhda, lekin "qaysi oila" ekanini bilmaydi → admin panelda `telegram_group_id` bo'sh.

Qo'shimcha: bot hozir `member` sifatida qo'shilgan, `administrator` emas. Moderatsiya funksiyalari (xabar o'chirish, mute) ishlamaydi.

## Yechim — uch qatlamli

### 1. Privat chatda "kutayotgan ulanish" mexanizmi

Foydalanuvchi `/yangi_oila` orqali oila yaratganda va "Botni guruhga qo'shish" tugmasini bosganda, biz `bot_sessions` ga uning `pending_link_family_id` ni saqlaymiz (TTL: 30 daqiqa). Telegramning `?startgroup=<CODE>` foydalanuvchi tarafida guruh tanlash dialogi ochadi va bot guruhga qo'shilganda:
- `handleMyChatMember` ishga tushadi
- `evt.from.id` (botni qo'shgan foydalanuvchi telegram_id) bo'yicha `bot_sessions`dan `pending_link_family_id` o'qiymiz
- Agar topilsa va o'sha oila hali `telegram_group_id` ga ega bo'lmasa → `families.telegram_group_id = chat.id`, `telegram_group_title = chat.title` yangilaymiz
- Foydalanuvchiga privat xabar: "✅ '<title>' guruhi <oila nomi>'ga ulandi"
- Guruhga xabar: "✅ Bu guruh '<oila nomi>' oilasiga ulandi. Iltimos botni admin qiling."
- `pending_link` ni tozalaymiz, `action_logs` ga `family_id` bilan yozamiz

### 2. Qo'lda bog'lash buyrug'i (zaxira)

Guruhda superadmin/owner `/link <invite_code>` yozsa:
- `invite_code` bo'yicha oilani topamiz
- Faqat o'sha oila owner_user_id ga teng telegram_id (yoki superadmin) bog'lasa qabul qilamiz
- `families.telegram_group_id`, `telegram_group_title` yangilanadi
- "✅ Guruh ulandi" javobi

Bu birinchi mexanizm ishlamasa (masalan boshqa odam botni qo'shgan bo'lsa) yordam beradi.

### 3. UI: admin panelda guruhni qo'lda ulash

`/dashboard/families` sahifasida har bir oila qatorida `telegram_group_id` bo'sh bo'lsa "Guruhni ulash" tugmasi:
- Modal: foydalanuvchiga `/link <CODE>` buyrug'ini guruhda yuborish ko'rsatmasi va invite_code ko'rsatiladi (nusxalash tugmasi bilan)
- Yoki: bot allaqachon qo'shilgan bo'lsa (yaqindagi `bot_added_to_group` log mavjud bo'lsa), shu logdagi `chat_id` larni dropdown qilib ko'rsatib, "Bu guruhga ulash" tugmasi (server fn → `families.telegram_group_id` ni yangilaydi)

### 4. Hozirgi "Usmonovlar oilasi" + "Weekand" guruhi uchun bir martalik tuzatish

Migration emas — UI orqali (yoki agar tezroq kerak bo'lsa, `supabase--migration` orqali bevosita):
```sql
UPDATE families SET telegram_group_id = -1002555325571, telegram_group_title = 'Weekand'
WHERE id = '0a600002-a7cb-4dae-a8cc-830b5dbc8153';
```
Bu bitta SQLni hozir bajarib qo'yamiz, kelajakdagi yangi oilalar uchun #1 va #2 ishlaydi.

## O'zgaradigan fayllar

- `src/server/telegramHandlers.server.ts`
  - `handleMyChatMember` ni kengaytirish (#1): `evt.from.id` orqali pending_link ni o'qish va `families` ni yangilash
  - Yangi `/link <code>` handler (#2) `handleMessage`'ning guruh bo'limida
- `src/server/telegramHandlers.server.ts` da oila yaratish flow (~535-553 qator): `bot_sessions` ga `pending_link_family_id` yozish (TTL bilan)
- `src/server/locales/uz.json` va `ru.json`: yangi xabarlar (`group_linked_success`, `group_link_invalid_code`, `group_link_unauthorized`, `link_command_help`)
- `src/routes/dashboard.families.tsx`: "Guruhni ulash" tugmasi/modal
- `src/server/families.functions.ts`: `linkFamilyToGroup({ familyId, chatId })` server fn (faqat owner/superadmin)
- Bir martalik SQL: Usmonovlar oilasini Weekand guruhiga bog'lash

Migration shart emas (mavjud sxema yetarli — `bot_sessions.data` jsonb, `families.telegram_group_id` allaqachon bor).
