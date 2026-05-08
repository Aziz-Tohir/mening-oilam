## Muammo

Mini-app'da Telegram'dan ikkinchi akkauntga o'tilganda ham birinchi user ma'lumotlari ko'rinmoqda. Oldingi `signOut()` yechimi yetarli bo'lmadi — Telegram WebView'da `localStorage`/`sessionStorage`/cookielar va SWR cache turg'un saqlanib qolyapti.

## Yechim

Bot tarafiga **`/reset`** (va alias `/logout`) buyrug'ini qo'shamiz. Foydalanuvchi botga shu komandani yuborganda:

1. `auth.users` jadvalida shu Telegram ID'ga bog'langan barcha sessiyalarni server tomondan bekor qilamiz (`supabaseAdmin.auth.admin.signOut(userId, 'global')`).
2. Botda javob beramiz: "✅ Sessiya tozalandi. Endi mini-app'ni qayta oching" — WebApp tugmasi bilan.

Mini-app (`dashboard.tsx`) tarafiga ham qo'shamiz:

3. URL'da `?reset=1` bo'lsa yoki Telegram `start_param=reset` kelsa — `localStorage.clear()`, `sessionStorage.clear()`, `supabase.auth.signOut()` chaqirib, keyin sahifani reload qilamiz. Shu orqali brauzer cache ham, SWR cache (`swr:` prefiksli sessionStorage) ham, Supabase token ham to'liq tozalanadi.
4. Bot javobidagi WebApp tugmasi `https://mening-oilam.lovable.app/dashboard?reset=1` URL'iga yo'naltiradi.

## Texnik tafsilotlar

**Fayllar:**
- `src/server/telegramHandlers.server.ts` — `/reset` va `/logout` komandalari uchun handler. Telegram ID bo'yicha `profiles` jadvalidan `user_id` olib, `supabaseAdmin.auth.admin.signOut(user_id, 'global')` chaqiramiz. Keyin xabarga javob qaytaramiz `reply_markup` bilan (`web_app` tugma).
- `src/routes/dashboard.tsx` — eng yuqorida yangi `useEffect`: agar `URLSearchParams`'da `reset=1` bo'lsa, hamma cache va sessiyani tozalab, `?reset=1`'ni URL'dan olib tashlab reload qilamiz.

**Qo'shimcha:** Hozirgi "akkaunt almashtirish" tekshiruvini ham kuchaytiramiz — faqat `signOut` emas, `localStorage.clear()` + `sessionStorage.clear()` ham qo'shiladi (SWR cache uchun).

## Foydalanish oqimi

1. User botda `/reset` yozadi → bot tasdiqlaydi va "Mini-app'ni ochish" tugmasini beradi.
2. Tugmani bosadi → mini-app to'liq toza holatda ochiladi va Telegram'dagi joriy akkaunt bo'yicha qaytadan auth qiladi.
3. Boshqa akkauntga o'tganda ham xuddi shu — `/reset` → ochish.
