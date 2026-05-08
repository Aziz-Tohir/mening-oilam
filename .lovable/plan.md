## Reja — boshqa bot xabarlarini ham taqiqlangan so'zlar bo'yicha o'chirish

**Hozirgi muammo:** `handleMessage` ichida begona bot xabari aniqlansa, darhol `handleForeignBotMessage` chaqirilib `return` qilinadi. Shuning uchun `moderateGroupMessage` (taqiqlangan so'zlar, anti-link, banned_words) begona bot xabarlariga umuman tegmaydi.

**Yechim — `src/server/telegramHandlers.server.ts`:**

1. Begona bot xabari aniqlanganda **avval** `text`/`caption`'ni `banned_words` ro'yxatiga solishtiramiz (mavjud `getBannedWords` cache'idan foydalanib).
2. Mos kelsa: original xabar darhol `deleteMessage` qilinadi, repost qilinmaydi, `action_logs` + `postLog` ga "foreign_bot_banned_word" yoziladi.
3. Mos kelmasa — hozirgi `handleForeignBotMessage` oqimi davom etadi (video/media repost yoki delete).
4. Shu yerda `anti_link` sozlamasi yoqilgan bo'lsa va begona bot xabarida URL bo'lsa — uni ham o'chiramiz (oq ro'yxatdan tashqari).

**Texnik tafsilot:**
- `cache.server.ts`'dan `getBannedWords(family.id)` ishlatiladi.
- Pattern tekshiruvi `moderation.server.ts`'dagi bilan bir xil (regex/literal, case-insensitive).
- Faqat `text` va `caption` tekshiriladi; media file_id'lari emas.

**Fayl:** faqat `src/server/telegramHandlers.server.ts` (340–350 qatorlar atrofi). Migratsiya kerak emas.

Tasdiqlasangiz, implement qilaman.