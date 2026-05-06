## A) Rasm konvertatsiyasi (sifatni saqlab)

### 1) Yangi util `src/utils/imageProcess.ts`
- Native `createImageBitmap` + `<canvas>` (qo'shimcha kutubxona shart emas)
- Eng uzun tomon **2048px**dan oshsa proporsional kichraytiradi
- PNG → PNG, qolganlar → **WebP quality 0.92** (fallback JPEG 0.92)
- `imageSmoothingQuality: "high"`
- `formatBytes` helper

### 2) `src/routes/dashboard.profile.tsx` — `handleFile`
- Validatsiyadan keyin `processImageForUpload(file)` chaqiriladi
- Upload yangi blob bilan, key kengaytmasi va `contentType` natijadan
- Konvertatsiya xato bersa — asl fayl bilan fallback
- Toast: "1.2 MB → 280 KB sifatda yuklandi"

## B) Admin a'zolarni to'g'ridan to'g'ri tahrirlash

### 3) `src/server/admin.functions.ts` — `updateMember` kengaytirish
- Whitelistga: `gender`, `photo_url`, `photo_is_private`, `status`, `username`, `relationship_to_inviter`
- (Mavjud: `full_name`, `birth_date`, `phone`, `bio`)
- Insert keyin `action_logs` + `postLog(familyId, "actions", ...)`
- RLS allaqachon adminga ruxsat beradi (`is_family_admin` policy bor)

### 4) `src/routes/dashboard.members.tsx` — tahrirlash UI
- Har bir qatorga "Tahrirlash" tugmasi (`useUserRole().isAdmin` bo'lsa ko'rinadi)
- `Dialog`: full_name, gender (Select), birth_date, phone, bio, relationship_to_inviter (Select), status (Select), photo upload (`processImageForUpload` bilan)
- "Saqlash" → `updateMember` → `invalidateCache` + `refetch`
- Mavjud "Bloklash"/"Birthday"/"Status" tugmalari saqlab qolinadi

## Tegilmaydi
- RLS / migratsiyalar
- Server avatar import (Telegram'dan)
- `family_members` jadval strukturasi

## Texnik tafsilot
```text
File → processImageForUpload → WebP/PNG blob → supabase.storage.upload
Members → "Tahrirlash" (admin) → Dialog → updateMember → action_logs + postLog
```

Xavfsizlik: UI tugmasi faqat UX uchun yashiriladi; haqiqiy himoya server fn `is_family_admin` tekshiruvi va RLS orqali.
