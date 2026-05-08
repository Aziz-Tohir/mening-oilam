Muammo aniqlandi: oxirgi Telegram update’larda reklama va video xabarlari bot nomidan emas, oddiy foydalanuvchi nomidan kelgan. Masalan `from.is_bot=false`, lekin xabarda `forward_origin`/`forward_from_chat` kanalga ishora qilgan va caption ichida `text_link` reklama havolasi bor. Shuning uchun hozirgi `from.is_bot`/`via_bot` tekshiruvi bu xabarlarni “begona bot xabari” deb ko‘rmayapti.

Reja:

1. `src/server/telegramHandlers.server.ts` ichida begona bot/media-detektorini kengaytiraman:
   - `from.is_bot` va `via_bot`dan tashqari `forward_origin`, `forward_from_chat`, `sender_chat`, `caption_entities`, `entities`, inline tugmalar va media+caption kombinatsiyalari ham tekshiriladi.
   - Foydalanuvchi tashlagan linkdan keyin kelgan video javobi alohida “external media response” deb taniladi.

2. Taqiqlangan so‘z tekshiruvini faqat `text/caption` bilan cheklamayman:
   - `caption_entities`dagi `text_link.url`, `entities`dagi mention/url/text_link qiymatlari ham tekshiriladi.
   - Shu sabab `@Chaqqon_robot`, kanal havolasi yoki reklama linki caption ichida yashirin bo‘lsa ham o‘chiriladi.

3. Anti-link tekshiruvini ham entity/link preview bo‘yicha kuchaytiraman:
   - Oddiy matndagi URL,
   - `text_link.url`,
   - mention,
   - `link_preview_options.url`,
   - inline button URLlari tekshiriladi.

4. Video qayta yuborish oqimini to‘g‘rilayman:
   - Agar foydalanuvchi avval guruhga link yuborgan bo‘lsa, keyingi video/captionli kanal-forward xabari original holatda o‘chiriladi.
   - Video file qayta yuklab olinib guruhga reklamasiz caption bilan jo‘natiladi.
   - Agar video bo‘lmasa yoki reklama/taqiqlangan so‘z bo‘lsa, shunchaki o‘chiriladi.

5. Bot yuborgan ogohlantirish xabarlarini avtomatik o‘chirish uchun bitta helper ishlataman:
   - `welcome_message_auto_delete_seconds` bo‘lsa shuni ishlatadi.
   - 0 bo‘lsa xavfsiz default bilan qisqa muddatdan keyin o‘chiradi.

6. Diagnostika uchun `action_logs`ga aniq sabab yoziladi:
   - `foreign_bot_banned_word`, `foreign_bot_anti_link`, `external_media_reposted`, `external_media_deleted` kabi sabablar bilan keyin tekshirish oson bo‘ladi.

Texnik o‘zgarishlar:

- Asosiy o‘zgarish: `src/server/telegramHandlers.server.ts`.
- Ehtimol kichik helper: `src/server/telegram.server.ts`ga file_id orqali `sendVideo` yuborish qo‘shilishi mumkin, agar download/upload sekin yoki limitga tushsa.
- Migratsiya kerak emas; mavjud `telegram_updates_raw`, `action_logs`, `banned_words`, `family_settings` ishlatiladi.

Kutilgan natija:

- Reklama captionli kanal-forward video xabarlari bot deb ko‘rinmasa ham ushlanadi.
- Taqiqlangan so‘z yoki havola bo‘lsa o‘chiriladi.
- Linkdan keyingi kerakli video reklamasiz qayta yuboriladi.
- Begona botlar/kanallar/fake media javoblari guruhda erkin qolib ketmaydi.