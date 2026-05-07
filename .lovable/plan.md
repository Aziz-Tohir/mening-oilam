## Hozirgi holat (tashxis)

Bazani tekshirdim — muammo aniqlandi:

| Ma'lumot | Holat |
|---|---|
| `family_members` jadvalda jami yozuv | **1 ta** (faqat Tohirjon — oila egasi) |
| `join_requests` jadvali | **bo'sh** |
| Nodiraxon (tg `6892492830`) profili | mavjud, lekin hech qaerda a'zo emas |
| `bot_sessions` | **bo'sh** (botda /start bossangiz, sessiya yozilishi kerak edi) |

Demak amalda hech kim botda muvaffaqiyatli /start bosib oilaga qo'shilmagan. Mini-app esa "Yuklanmoqda…" ko'rinishida qotib qoladi, chunki:

1. **Oddiy user uchun**: `miniapp-auth` `family_members.telegram_id` topa olmaydi → 403 qaytaradi, lekin `dashboard.tsx`'dagi `useEffect`'da `tgAuthing=false` bo'ladi-yu, `user=null` qoladi va `tg.initData` mavjud bo'lgani uchun `/login`'ga ham yo'naltirmaydi → cheksiz "Yuklanmoqda…".
2. **Owner uchun ham**: 401/500 yuz bersa, xatoning aniq sababi ko'rinmaydi va xuddi shu loop'da qoladi.
3. **Botda /start ishlamayapti**: sessiyalar va join_request umuman yaratilmayapti — webhook yoki handler'da muammo bo'lishi mumkin.

## Yechim — to'liq oqim

### 1. Botda /start oqimini tiklash va kuzatish
- Webhook/poll holatini tekshirish (`telegram_updates_raw`'ga payload tushyaptimi?). Agar tushmasa, webhook URL'ini qayta o'rnatish.
- `/start` handlerda har bir qadamda `action_logs`'ga diagnostic yozish — qaysi joyda to'xtab qolayotganini ko'rish uchun.
- `/start fam_<INVITE_CODE>` deep-link uchun aniq xato xabarlari qo'shish.

### 2. Mini-app auth'ni mustahkamlash (`/api/public/telegram/miniapp-auth` + `dashboard.tsx`)
- Owner/admin profilga telegram_id bog'langan bo'lsa, `family_members` yozuvini avtomatik yaratish allaqachon bor — uni kengaytirib, **invite_code orqali kelgan oddiy user uchun ham** xuddi shunday auto-link qilish (agar yaqinda `pending_link` sessiyada bo'lsa).
- Faqat 403 / 4xx qaytishida `dashboard.tsx` foydalanuvchini **`/login`'ga yo'naltirsin** va aniq xato `toast`'da chiqsin (hozir `tg.initData` bor bo'lsa redirect bloklangan).
- "Doimiy Yuklanmoqda…" o'rniga: agar `tgAuthing=false && !user && initData mavjud` bo'lsa — **xato xabari + qayta urinish tugmasi** ko'rsatilsin.
- `tg6892492830@telegram.local` kabi orphan profil bor bo'lsa, mini-app auth uni topib qayta ishlatishi kerak (hozir bor, lekin `family_members` yo'q bo'lgani uchun baribir to'xtaydi).

### 3. Web orqali admin a'zo qo'shish (qo'lda fallback)
- `dashboard.members` sahifasida **"+ Yangi a'zo"** modali: `full_name`, `telegram_id` (majburiy), `username`, `gender`, `birth_date`. Status darhol `active`.
- Yangi server-fn `addMemberManually(familyId, …)` — `is_family_admin` orqali tekshiriladi, `getAdminDb()` ishlatiladi.
- Bu tugma allaqachon mavjud bo'lsa, `telegram_id` majburiy maydon ekanligini tekshirish (hozir hech kim qo'shilmaganidan ko'rinib turibdi).

### 4. Mini-app'da "ro'yxatdan o'tish" ekrani
- Agar 403 `not_registered` qaytsa: mini-app oddiy login sahifasi o'rniga **"Invite kod kiriting"** ekrani ko'rsatsin, kod orqali server `join_request` yaratsin va admin tasdiqlashini kutsin.
- Tasdiqdan keyin mini-app avtomatik qaytib kirsin.

### 5. Sinov (men bajaraman, davomida ko'rsatib boraman)
- Nodiraxon uchun qo'lda `family_members` yozuvini yaratib, mini-app login'ni tekshirish.
- Tohirjon uchun mini-app login'ni qayta tekshirish.
- Botda `/start` → `/start fam_<INVITE>` ketma-ketligini sinash.

### Texnik tafsilotlar
- O'zgartiriladigan fayllar: `src/routes/dashboard.tsx` (loading/redirect logikasi), `src/routes/api/public/telegram/miniapp-auth.ts` (xato shakli + invite_code bilan auto-join), `src/server/telegramHandlers.server.ts` (diagnostika), `src/routes/dashboard.members.tsx` (qo'lda qo'shish modali), yangi `src/routes/miniapp-register.tsx` yoki dialog.
- DB o'zgarishi shart emas — RLS/funksiyalar yetarli.
- Hech qanday yangi secret kerak emas.