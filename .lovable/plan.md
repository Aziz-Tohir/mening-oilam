## A) `src/lib/relationships.ts` — yangi optionlar
Ro'yxat boshiga qo'shiladi:
- `{ value: "self", label: "Men (o'zim)" }`
Va qo'shimcha qarindoshlik turlari:
- `step_father` — "O'gay otam"
- `step_mother` — "O'gay onam"
- `step_son` — "O'gay o'g'lim"
- `step_daughter` — "O'gay qizim"
- `half_brother` — "O'gay akam/ukam"
- `half_sister` — "O'gay opam/singlim"
- `great_grandfather` — "Buvamning otasi"
- `great_grandmother` — "Buvamning onasi"
- `great_grandson` — "Chevaram (o'g'il)"
- `great_granddaughter` — "Chevaram (qiz)"
- `godfather` — "Otaxon"
- `godmother` — "Onaxon"
- `family_friend` — "Oila do'sti"

`relationshipLabel()` o'zgarmaydi (avtomatik ishlaydi).

## B) `src/routes/dashboard.members.tsx` — `EditMemberDialog`

### 1) Jins tanlanmaslik bug'i
Hozirgi `Select` `value=""` qabul qilmaydi (Radix bo'sh stringga ruxsat bermaydi → boshlang'ich qiymat ko'rinmaydi). Yechim: `value={form.gender || undefined}` qilib uzatish va "Tanlanmagan"ni placeholder sifatida qoldirish. Xuddi shu yondashuv `relationship_to_inviter` uchun ham qo'llanadi.

### 2) Real-time validatsiya
Yangi lokal `errors` state (`Record<string,string>`) + har bir maydon `onChange`da tekshiriladi. `Saqlash` tugmasi `Object.keys(errors).length>0` bo'lsa disabled.

Qoidalar:
- **full_name**: trim, 2–128 belgi → "Kamida 2 ta belgi"
- **username**: bo'sh yoki `^[A-Za-z0-9_]{3,32}$` → "Faqat harf/raqam/_ (3–32)"
- **phone**: bo'sh yoki `^\+?[0-9 ()\-]{7,20}$`, normalize qilingan raqamlar 7–15 ta → "Telefon noto'g'ri (masalan +998901234567)"
- **birth_date**:
  - kelajakdagi sana emas → "Kelajakdagi sana bo'lmasin"
  - 1900-yildan keyin → "Sana juda eski"
  - yosh > 130 → "Sana mantiqsiz"
- **bio**: ≤1000 belgi (counter ko'rsatiladi)

Har bir input ostida xato matni qizil rangda (`text-destructive text-xs`) ko'rsatiladi, input `aria-invalid` bilan belgilanadi.

### 3) Rasm preview va meta
`handleFile`da yuklashdan **oldin**:
- `URL.createObjectURL(file)` — original preview
- `processImageForUpload(file)` natijasidan WebP/PNG blob yaratiladi va `URL.createObjectURL(blob)` orqali yangi preview
- Pending state: `{ originalUrl, processedUrl, originalSize, processedSize, w, h, contentType, blob, ext }`
- Dialogda preview kartasi ko'rsatiladi:
  ```
  [original thumb] → [processed thumb]
  1.8 MB JPEG  →  240 KB WebP  •  1920×1280
  [Tasdiqlash] [Bekor qilish]
  ```
- "Tasdiqlash" bosilganda haqiqiy `supabase.storage.upload` chaqiriladi va `form.photo_url` yangilanadi
- "Bekor qilish" — pending tozalanadi, `URL.revokeObjectURL` chaqiriladi
- `useEffect` cleanup: dialog yopilganda barcha objectURL'lar revoke qilinadi

Bu bilan foydalanuvchi yuklashdan oldin natijani ko'radi va kichraytirish foydasini tushunadi.

## Tegilmaydi
- Server fn (`updateMember`) — whitelist allaqachon yetarli
- `src/utils/imageProcess.ts` — o'zgarmaydi
- RLS / migratsiyalar

## Texnik tafsilot
```text
File picker → URL.createObjectURL(original) + processImageForUpload → URL.createObjectURL(processed)
            → Preview card (before/after, size, dims)
            → "Tasdiqlash" → storage.upload → setForm({photo_url})
            → cleanup: revokeObjectURL on close/replace

Form field onChange → validateField → setErrors → red helper text + disable Submit
Select gender/relationship: value={form.x || undefined}  (Radix-friendly)
```
