## Maqsad

Hozirda sozlamalarda 3 ta alohida chat ID bor (log, admin, backup). Buni bitta **Telegram forum guruhi** + har bir log turi uchun **topic ID** ko'rinishiga o'tkazamiz. Bot barcha loglarni shu bitta guruhga, lekin tegishli topicga (`message_thread_id`) yuboradi.

## O'zgarishlar

### 1) Ma'lumotlar bazasi (migratsiya)
`family_settings` jadvaliga yangi ustunlar:
- `log_topic_actions integer` — admin amallar logi uchun topic ID
- `log_topic_admin integer` — admin bildirishnomalari (join request, ogohlantirish va h.k.)
- `log_topic_moderation integer` — moderatsiya (delete, mute, ban) loglari
- `log_topic_backup integer` — JSON backup va eksportlar

`log_telegram_chat_id` ustunini saqlab qolamiz — endi u **forum guruh** ID si (yagona manzil). `admin_notification_channel_id` va `backup_telegram_chat_id` ustunlari saqlab qolinadi (eski ma'lumot uchun), lekin yangi kod faqat `log_telegram_chat_id` + topiclardan foydalanadi.

### 2) Yangi helper `src/server/logChannel.server.ts`
```ts
postLog(familyId, topic: "actions"|"admin"|"moderation"|"backup", text, opts?)
```
- `family_settings`dan `log_telegram_chat_id` va tegishli `log_topic_*` ni o'qiydi
- Agar `log_telegram_chat_id` bo'sh bo'lsa — jim qaytadi
- `sendMessage`ni `message_thread_id` bilan chaqiradi
- Xatolarni yutadi (log yuborish asosiy oqimni to'xtatmasligi kerak)

### 3) `src/server/telegram.server.ts`
`sendMessage` opsiyalariga `message_thread_id?: number` qo'shiladi (allaqachon options tarqatadi, faqat tipni kengaytirish).

### 4) Mavjud joylarni ulash
- **Action loglar** (`action_logs.insert` → 6 joy): `bot.functions.ts`, `admin.functions.ts`, `families.functions.ts`, `telegramHandlers.server.ts`, `moderation.server.ts` — har bir insertdan keyin `postLog(familyId, "actions", ...)`.
- **Moderatsiya** (`moderation.server.ts` ichida banned-word, mute, warning) → `postLog(... "moderation" ...)`.
- **Admin bildirishnomalar** (`admin_notifications.insert` va join_request flow) → `postLog(... "admin" ...)`.
- **Backup** (annual-awards / kelgusi backup cron) → `postLog(... "backup" ...)`. Agar alohida backup oqim mavjud bo'lmasa, faqat helper tayyor turadi.

### 5) UI — `dashboard.settings.tsx` "Bildirishnoma kanallari" kartasi
Eski 3 input o'rniga:
- **Log guruhi (forum chat ID)** — `log_telegram_chat_id`
- **Topic: Amallar** — `log_topic_actions`
- **Topic: Admin** — `log_topic_admin`
- **Topic: Moderatsiya** — `log_topic_moderation`
- **Topic: Backup** — `log_topic_backup`
- Backup chastotasi (mavjud) qoladi

Karta tepasiga qisqa ko'rsatma: "Telegram'da forum guruh oching, har bir bo'lim uchun topic yarating va topic ID sini bu yerga yozing. Topic ID ni topic havolasidan ko'rishingiz mumkin (`.../<chat>/<topic_id>`)."

### 6) `admin.functions.ts` `updateSettings` allowed-field ro'yxati
Yangi 4 ta `log_topic_*` maydonlarini whitelistga qo'shamiz.

## Texnik tafsilot

```text
log group (forum)
├─ topic: Amallar       ← action_logs
├─ topic: Admin         ← join_requests, admin_notifications
├─ topic: Moderatsiya   ← warnings, deletes, mutes/bans
└─ topic: Backup        ← weekly/annual JSON dumps
```

`sendMessage(chatId, text, { message_thread_id: topicId })` — Telegram Bot API'ning standart forum topic'ga yuborish usuli.

## Tegilmaydigan narsalar
- Cron jadvallari
- Mavjud `admin_notifications` / `action_logs` jadval strukturasi
- Telegram webhook
