# Kunlik AI sentiment tahlili + grafiklar + maxfiylik

## Joriy holat

- `messages_stats` jadvalida `sentiment_score (numeric)` va `sentiment_analyzed_at` ustunlari **bor**, lekin hech qaerda **yozilmaydi**.
- Yillik mukofotlar (`/api/public/cron/annual-awards.ts:54–58`) "Yil quvonchi" uchun aynan shu `avg(sentiment_score)` dan foydalanadi — hozir har doim `null`, demak nominatsiya hech qachon hisoblanmaydi.
- Xabar matni hech qaerda saqlanmaydi (`messages_stats` faqat sanaga kunlik count yozadi). Bu maxfiylik nuqtai nazaridan yaxshi — biz buni saqlab qolamiz: matn hech qachon DB ga **yozilmaydi**, faqat AI'ga jo'natiladi va natija **agregat** sentiment qoladi.
- Lovable AI Gateway (LOVABLE_API_KEY) tayyor.

## Maqsad

1. Har kuni guruh xabarlarini AI orqali tahlil qilib, har bir a'zo uchun kunlik o'rtacha `sentiment_score` ni `messages_stats` ga yozish.
2. Maxfiylik: matnlar saqlanmaydi, faqat agregat raqam. Adminlar matnni ko'rmaydi. Foydalanuvchi opt-out qila oladi.
3. Yillik "Yil quvonchi" mavjud cron orqali avtomatik to'g'ri ishlaydi.
4. Admin panelida grafiklar: oilaning kunlik sentiment trendi, a'zolar bo'yicha taqqoslash, oylik issiqlik xaritasi.

## Maxfiylik prinsiplari (CRITICAL)

- **Matn DB'ga yozilmaydi.** Bot handler'da xabar `messages_stats` count'iga qo'shiladi va shu yerda **xotira ichida** kunlik buferda saqlanadi (`telegramHandlers.server.ts` da). Bufer `cache.server.ts` ga emas (Worker invocation'lar orasida ishonchsiz) — buning o'rniga ixtiyoriy `daily_message_buffer` jadvali (faqat bot-pipeline yoza/o'qiy oladi, RLS deny-all clients) va cron tahlildan so'ng **DELETE**.
- Saqlanmaydi: foydalanuvchi ID, telegram_id, sana, **xeshlangan** xabar (yaxlit text emas) — SHA-256(text+family_salt) idempotency uchun. Xabar matni cron oxirida o'chiriladi.
- Foydalanuvchi opt-out: `family_members.sentiment_opt_out boolean default false`. True bo'lsa — uning xabarlari bufergaham yozilmaydi.
- AI prompt: "Quyidagi xabarlarni 0..1 (xafa..quvnoq) shkalada baholang. Faqat raqam qaytaring." Tilga sezgir; o'zbek/rus/ingliz hammasi gemini tomonidan qo'llab-quvvatlanadi.
- Eng kichik agregat: kuniga **kamida 3 xabar** bo'lgan a'zolar uchun saqlash (yakka xabar = identifikatsiya xavfi). Aks holda `null`.
- Adminlar UI'da **agregat** (kunlik o'rtacha) ko'radi, individual xabarni emas.

## Migratsiya

```sql
-- Opt-out
ALTER TABLE public.family_members
  ADD COLUMN sentiment_opt_out boolean NOT NULL DEFAULT false;

-- Vaqtinchalik bufer (faqat service role)
CREATE TABLE public.daily_message_buffer (
  id bigserial PRIMARY KEY,
  family_id uuid NOT NULL,
  telegram_id bigint NOT NULL,
  member_id uuid,
  message_date date NOT NULL,
  text text NOT NULL,
  text_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dmb_family_date ON public.daily_message_buffer (family_id, message_date);
CREATE UNIQUE INDEX uq_dmb_dedupe ON public.daily_message_buffer (family_id, telegram_id, message_date, text_hash);
ALTER TABLE public.daily_message_buffer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all to clients dmb" ON public.daily_message_buffer
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
```

## O'zgarishlar

### 1. `src/server/telegramHandlers.server.ts` — bufer to'ldirish

`messages_stats` count yangilash blokidan keyin (165–174):
```ts
// Sentiment buffer — faqat opt-out bo'lmagan a'zolar uchun va matnli xabar
const text = (msg as any).text;
if (text && typeof text === "string" && text.trim().length >= 3) {
  const mem = await getMemberByTelegramId(family.id, msg.from.id);
  if (!mem?.sentiment_opt_out) {
    const { createHash } = await import("crypto");
    const hash = createHash("sha256")
      .update(`${family.id}:${text}`).digest();
    await db.from("daily_message_buffer").insert({
      family_id: family.id, telegram_id: msg.from.id,
      member_id: mem?.id ?? null, message_date: today,
      text: text.slice(0, 1000), text_hash: hash,
    }).then(() => {}, () => {}); // dedupe konfliktda jim
  }
}
```

`getMemberByTelegramId` cache'iga `sentiment_opt_out` qo'shish (kichik patch `cache.server.ts` da: select'ga ustun qo'shish).

### 2. Yangi cron: `src/routes/api/public/cron/sentiment-analysis.ts`

Har kuni 02:00 da kechagi kunni tahlil qiladi:

```ts
// 1. Kechagi sanani aniqlash
// 2. Bufer'dan har bir (family_id, telegram_id) bo'yicha xabarlarni guruhlash
// 3. Agar < 3 xabar — o'tkazib yuborish
// 4. Lovable AI Gateway (gemini-3-flash-preview) ga JSON tool-call:
//    schema: { items: [{ telegram_id, score: number 0..1 }] }
//    Bir family uchun barcha a'zolarni bitta requestda jo'natish
//    (5–50 a'zo, har biriga 5–100 xabar — token cheklovi atrofida).
//    Katta hajm bo'lsa member-by-member yoki chunked.
// 5. score'ni -1..1 ga moslash: score*2 - 1.
// 6. messages_stats UPDATE: sentiment_score, sentiment_analyzed_at
//    (familyId, telegram_id, yesterdayISO) bo'yicha.
// 7. Tahlil tugagach DELETE FROM daily_message_buffer WHERE message_date <= yesterday.
//    (Eski buferlarni ham tozalaydi — fail-safe.)
```

Auth: `?secret=` + `CRON_SECRET` (mavjud pattern bilan bir xil).

Pg_cron schedule (migratsiya bilan birga):
```sql
SELECT cron.schedule(
  'sentiment-analysis-daily',
  '0 2 * * *',
  $$ SELECT net.http_post(
    url := 'https://project--858ca73f-22bf-4369-b9d0-1671ce37994d.lovable.app/api/public/cron/sentiment-analysis',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('secret', current_setting('app.cron_secret', true))
  ) $$
);
```

(Yoki existing `daily-reminders` da ishlatilgan paterni qaytarish — kodbazada tekshiriladi va shu uslubda yoziladi.)

AI rate limit (429) va credit (402) xatolarini admin uchun `action_logs` ga yozib qo'yish, lekin partial natijani saqlash.

### 3. Server functions: `src/server/sentiment.functions.ts`

```ts
export const getSentimentTrend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({
    familyId: z.string().uuid(),
    days: z.number().int().min(7).max(365).default(90),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: messages_stats select policy is family member only — OK.
    const since = new Date(Date.now() - data.days*86400_000).toISOString().slice(0,10);
    const { data: rows } = await context.supabase
      .from("messages_stats")
      .select("message_date, sentiment_score, member_id, telegram_id, messages_count")
      .eq("family_id", data.familyId)
      .gte("message_date", since)
      .not("sentiment_score", "is", null);
    return { rows: rows ?? [] };
  });

export const setSentimentOptOut = createServerFn(...)
  // current user member yozuvini topib sentiment_opt_out yangilaydi
```

### 4. Admin grafiklar: `src/routes/dashboard.stats.tsx` (yoki yangi `dashboard.sentiment.tsx`)

`recharts` (shadcn `chart` allaqachon ulangan) bilan:

- **Line chart** — kunlik o'rtacha sentiment (oila bo'yicha). X: sana, Y: -1..1.
- **Bar chart** — top a'zolar (so'nggi 30 kun avg). Faqat ko'rinadigan ism agar opt-out qilmagan bo'lsa, aks holda "Maxfiy".
- **Heatmap (oddiy CSS grid)** — oxirgi 12 oy × 31 kun, hujayra rangi avg sentiment'ga (qizil → sariq → yashil).
- **Cards**: Bugungi avg, 7-kun avg, 30-kun avg.
- Filter: oila tanlovi (mavjud pattern).
- "Bu yil quvonchi" preview — `getSentimentTrend` natijasi bo'yicha eng yuqori 30-kun avg a'zoni ko'rsatish (cron'gacha kutmasdan).

### 5. Profil sahifasi: opt-out toggle

`src/routes/dashboard.profile.tsx`'ga "Maxfiylik" karta:
- "Mening xabarlarim ruhiy holat tahliliga qo'shilmasin" — Switch.
- Tushuntirish: "Yoqilganda sizning xabarlaringiz AI tahliliga jo'natilmaydi. Allaqachon hisoblangan o'tgan kunlar saqlanib qoladi (lekin matn hech qachon saqlanmagan)."

### 6. Bot komandasi `/privacy`

DM'da: hozirgi opt-out holati + "🔕 Tahlilni o'chirish / 🔔 Yoqish" inline tugmalar. Locale matnlari `uz/ru/en`.

### 7. Sidebar/router (`dashboard.tsx`)

Yangi yo'l `/dashboard/sentiment` (yoki Stats sahifasiga tab). Admin-only emas — barcha a'zolar avg trendni ko'ra olishadi (RLS allow); individual a'zolar ro'yxati esa faqat admin ko'radi (UI tomonida `useUserRole` orqali yashirish + server functionda admin check).

## Texnik tafsilotlar

- **Token byudjeti**: Bir oilada o'rtacha 50 a'zo × 30 xabar/kun = 1500 xabar. Gemini-3-flash-preview kontekstida bemalol sig'adi. Agar oshib ketsa — member-bo'limli batch (10 ta a'zo bir requestda).
- **Idempotency**: cron qayta ishga tushsa, `messages_stats.sentiment_analyzed_at IS NOT NULL` qatorlar o'tkazib yuboriladi.
- **Skor normalizatsiyasi**: AI 0..1 (xafa..quvnoq) qaytaradi (modelga oson) → biz `2x-1` ga aylantirib `-1..1` ga olib kelamiz (mavjud sxema bilan mos).
- **Til**: prompt o'zbek tilida, lekin xabarlar har qanday tilda bo'lishi mumkin — modelga "tilidan qat'iy nazar" deb aytamiz.
- **Buferdan o'chirish**: tahlil tugashi bilanoq DELETE — agar AI fail bo'lsa, bufer 24h saqlanadi va ertasi cron qayta urinadi (`message_date < now()-1` bo'lsa fail-safe DELETE bekor qilinadi).
- **Aniqlik dasturi**: `messages_count >= 3` filtri natijaga ham, AI'ga ham jo'natishga qo'llaniladi. 1–2 xabarli a'zolar tahlil qilinmaydi — anonimlikni saqlaydi.
- **Maxfiylik annonsi**: bot guruhga qo'shilganda yoki `/help` da: "Botda kun davomida AI sentiment tahlili ishlaydi. Matn saqlanmaydi, faqat 0..1 raqam. /privacy bilan o'chiring." Locale'larga qo'shiladi.
- **Annual awards**: kod o'zgarmaydi — `messages_stats.sentiment_score` to'lganligi sabab "Yil quvonchi" avtomatik hisoblanadi.

## Bajarilish tartibi

1. Migratsiya: `sentiment_opt_out`, `daily_message_buffer` jadval + RLS + dedupe index.
2. `cache.server.ts` `getMemberByTelegramId` ga `sentiment_opt_out` qo'shish.
3. `telegramHandlers.server.ts` — bufer yozuvi.
4. Yangi cron route + pg_cron schedule.
5. `sentiment.functions.ts` — `getSentimentTrend`, `setSentimentOptOut`.
6. UI: yangi `dashboard.sentiment.tsx` (yoki Stats tab) + Profil opt-out + bot `/privacy`.
7. Locale matnlari (`uz/ru/en`): privacy, opt-out, help annoncement.