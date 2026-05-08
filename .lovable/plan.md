## Muammolar tahlili

### 1) Guruhdan chiqib ketgan/kick qilingan foydalanuvchi va `/start`
Hozirgi oqim:
- Yangi a'zo guruhga qo'shilsa, `enforce_bot_onboarding` yoqilgan bo'lsa, `restrictChatMember` (mute) qilinadi. `family_members` jadvaliga yozuv qo'shilmaydi.
- Foydalanuvchi botda `/start` bossa, `sendStartFlow` `family_members.status='active'` bo'yicha qidiradi → topmaydi → "oila yaratish / qo'shilish" tugmalarini chiqaradi.
- Lekin agar avtomoderatsiya `kick` (banChatMember) qilgan bo'lsa, Telegram darajasida user **ban** holatida — `/start` join so'rovi yuborsa ham, deep-link orqali guruhga qaytib kira olmaydi.
- Bundan tashqari, `family_members` jadvalida status `blocked` bo'lib qolgan a'zolar ham `/start`da hech qanday tushuntirish ko'rmaydi.

### 2) Begona bot media (reklamali repost)
- `handleForeignBotMessage` faqat `msg.from.is_bot` bo'yicha aniqlaydi. Media-botlar ko'p hollarda foydalanuvchi xabariga `via_bot` orqali javob beradi — bu vaqtda `from` real user bo'lib qoladi va detektor ishlamaydi → bot reklamali captionli xabar guruhda qoladi.
- `manage_foreign_bot_media` default `false` — yoqilgan bo'lsa ham yuqoridagi sabab tufayli reklamani ushlamaydi.

### 3) Boshqa botlarni faqat admin qo'sha olishi
- `new_chat_members` ichida bot bo'lsa hech qanday tekshiruv yo'q. Istalgan a'zo istalgan botni qo'sha oladi.

---

## Yechim

### A. Foreign-bot media moderatsiyasi to'g'rilanadi (`src/server/telegramHandlers.server.ts`, `moderation.server.ts`)
- `handleMessage` ichidagi detektsiya kengaytiriladi: `(msg.from?.is_bot && username !== ours) || (msg.via_bot && msg.via_bot.username !== ours)` → foreign bot deb qaraladi.
- `handleForeignBotMessage` har doim original captionni **butunlay tashlaydi** (faqat bizning credit caption qo'yiladi). Hech qanday inline tugmalar/entitiyalar ko'chirilmaydi.
- Yangi guruh ulanishida `family_settings.manage_foreign_bot_media` default `true` qilib qo'yiladi (yangi yaratiladigan oilalar uchun); mavjudlarini ham migratsiya qilamiz.
- Fallback xato bo'lsa hech bo'lmasa original delete qilinadi (hozirgi xatti-harakat saqlanadi).

### B. Begona botlarni faqat adminlar qo'sha olishi (`telegramHandlers.server.ts`)
- `new_chat_members` ichida `is_bot=true` bo'lganlar uchun:
  1. Agar bu **bizning** botimiz bo'lsa — o'tkazib yuboriladi.
  2. Aks holda, qo'shgan odam (`msg.from.id`) `getChatMember` orqali tekshiriladi; agar `creator`/`administrator` emas bo'lsa:
     - Begona bot `banChatMember` orqali olib tashlanadi.
     - Qo'shgan userga ogohlantirish (mention, auto-delete) yuboriladi.
     - `action_logs`/`postLog` ga moderatsiya yozuvi.
  3. Admin qo'shgan bo'lsa — tegmaymiz.
- Shu yerda `delete_join_leave_messages` mantig'i bilan to'qnashmasligi uchun bot-kick logikasi avval ishlaydi.

### C. Kick qilingan/blok foydalanuvchi uchun /start UX
1. **Avtomoderatsiya kick** (`moderation.server.ts`): `act === "kick"|"ban"` bo'lsa va `family_members` topilsa, statusni `blocked` qilib yangilaymiz (qayta join so'rovi adminga ko'rinishi uchun).
2. **`sendStartFlow`** (`telegramHandlers.server.ts`): `active` qatorida `status` filtrini olib tashlaymiz va barcha statuslarni qaytaramiz:
   - `blocked` topilsa → "Siz `<oila>` guruhidan chiqarilgansiz. Qaytadan qo'shilish uchun admin tasdiqi kerak." matni + "Qayta so'rov yuborish" tugmasi (yangi `join_request` ochadi va guruhdagi banni `unbanChatMember` orqali olib tashlaydi, **lekin** faqat admin so'rovni tasdiqlaganda — hozircha tugma bosilganda yangi `awaiting_admin_approval` join_request yaratiladi va admin tasdiqlasa unban + invite yuboriladi).
   - `pending` bo'lsa → "So'rovingiz ko'rib chiqilmoqda" matni.
   - `active` bo'lsa → hozirgidek "siz allaqachon a'zosiz".
3. **Guruhdan o'z xohishi bilan chiqib ketganlar** (`left_chat_member` event): agar foydalanuvchi `family_members`da bor bo'lsa va `from.id === left.id` (o'zi chiqdi) — status `blocked` emas, `pending` qilamiz va botga DM: "Guruhdan chiqdingiz. Qaytib kirish uchun /start bosing". Admin qo'shgan/kick qilgan bo'lsa tegmaymiz.

### D. Admin tasdiqi orqali qaytarib qo'shish
- Admin join_request'ni tasdiqlaganda (mavjud `approveJoinRequest` oqimi) — `unbanChatMember(group_id, applicant_telegram_id)` chaqirib, keyin guruhga invite link yuboriladi. Bu mavjud join oqimiga kichik qo'shimcha.

---

## Texnik tafsilotlar

**Fayllar:**
- `src/server/telegramHandlers.server.ts` — `handleMessage` (foreign bot detektsiya + `new_chat_members` bot guard), `sendStartFlow` (status-aware UX), `left_chat_member` ishlovi, join approve da `unbanChatMember`.
- `src/server/moderation.server.ts` — kick/ban dan keyin `family_members.status='blocked'`.
- Migratsiya: `family_settings.manage_foreign_bot_media` ustuni default `true` ga (yangilar uchun); mavjud qatorlar `update`.

**Xatti-harakat o'zgarishlari (foydalanuvchi ko'radi):**
- Media-bot javoblari (`via_bot`) endi qayta clean repost qilinadi — reklama yo'q.
- Begona bot qo'shilsa, admin emas qo'shgan bo'lsa, bot avtomatik o'chiriladi va qo'shgan a'zoga ogohlantirish.
- `/start` bosgan bloklangan foydalanuvchi aniq xabar va "qayta so'rov" tugmasini ko'radi; admin tasdiqlasa unban bo'ladi va join link yuboriladi.

Tasdiqlasangiz, ushbu o'zgarishlarni implement qilaman.