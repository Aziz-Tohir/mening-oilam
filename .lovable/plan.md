## Maqsad

Botli oilada **botdan o'tmasdan** to'g'ridan-to'g'ri guruhga qo'shilgan foydalanuvchi guruhda yoza olmasin (muted). Bot orqali ro'yxatdan o'tib `family_members.status = 'active'` bo'lgach — avtomatik mute olib tashlanadi. Adminlar buni Sozlamalardan yoqib/o'chirib qo'ya olishi kerak.

## O'zgarishlar

### 1) Sozlama (DB)

Migration: `family_settings`'ga ustun qo'shamiz

- `enforce_bot_onboarding boolean not null default true`

### 2) Guruhga qo'shilganda mute (`telegramHandlers.server.ts`)

`handleMessage`'da `msg.new_chat_members` qismini kengaytiramiz:

- Family topilsa va `enforce_bot_onboarding = true` bo'lsa, har bir yangi a'zo uchun:
  - botning o'zini va mavjud `active` `family_members` (telegram_id bo'yicha)ni o'tkazib yuboramiz
  - qolganlariga `restrictChatMember(chat.id, user.id)` (until_date'siz = doimiy mute)
  - guruhga qisqa xabar: "@username, iltimos botga /start yuboring va ro'yxatdan o'ting. Tasdiqlangach yozish mumkin." (welcome auto-delete bilan, agar sozlangan bo'lsa)
  - `action_logs`'ga `joined_unverified_muted` yozuvi
- `delete_join_leave_messages` mantigi avvalgidek qoladi (xizmat xabarini o'chirish bilan birga mute ham qo'yiladi)

Shuningdek `chat_member` updateni ham qo'llab-quvvatlash uchun `processUpdate`'da `update.chat_member` shoxini qo'shamiz (foydalanuvchi linkka ergashib o'zi qo'shilgan holatlar uchun) va `setWebhook`'ning `allowed_updates`'ga `chat_member` qo'shilishini tekshiramiz/qayta ro'yxatdan o'tkazamiz.

### 3) Tasdiqlangach unmute

`handleApproveJoin` (join_requests approve) ichida — `family_members.status` `active` bo'lgach, agar `families.telegram_group_id` bor bo'lsa, `restrictChatMember` chaqirib **barcha permissionlarni qaytarib** beramiz. Buning uchun `telegram.server.ts`'ga yangi helper qo'shamiz: `unrestrictChatMember(chatId, userId)` — Telegram `restrictChatMember` ni to'liq permissions bilan chaqiradi (`can_send_messages: true`, ...).

### 4) Sozlamalar UI (`dashboard.settings.tsx`)

"Onboarding" kartochkasiga yangi switch:

- **"Botdan ro'yxatdan o'tishni majburlash"** → `enforce_bot_onboarding`
- Yordamchi izoh: "Yoqilgan bo'lsa, guruhga to'g'ridan-to'g'ri qo'shilganlar bot orqali tasdiqlanmaguncha yoza olmaydi."

### 5) admin.functions.ts

Patch sxemasini kengaytiramiz (`updateFamilySettings` allaqachon ixtiyoriy patch oladi — alohida o'zgarish shart emas, faqat tip yangilanadi).

## Texnik tafsilotlar

- `restrictChatMember` until_date siz = doimiy
- Bot guruhda admin bo'lishi kerak (allaqachon shart). Agar bot admin emas bo'lsa, API xato qaytaradi — `try/catch` bilan log qilamiz, jarayon to'xtamaydi.
- `chat_member` updatesi uchun webhook `allowed_updates`'iga `"chat_member"` qo'shilishini ta'minlaymiz (bot tomondan polling/webhook setupida).