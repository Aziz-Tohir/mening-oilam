## Maqsad

Faqat **superadmin** barcha oilalarni to'liq boshqara olsin. Hozircha minimal — keyinroq kengaytiramiz.

## Kim qila oladi

`user_roles.role = 'superadmin'` bo'lgan har qanday foydalanuvchi (tizimda allaqachon mavjud rol — hech qanday yangi enum/migratsiya kerak emas).

Server tomonida har bir funksiyada tekshiruv:
```ts
const { data } = await supabase.from("user_roles")
  .select("role").eq("user_id", userId).eq("role", "superadmin").limit(1);
if (!data?.length) throw new Error("Faqat superadmin uchun");
```

## Backend — `src/server/superadmin.functions.ts` (yangi)

4 ta server function, hammasi `getAdminDb()` (service role) ishlatadi RLS aylanib o'tish uchun:

1. **`listAllFamilies()`** — barcha oilalar: `id, name, owner_user_id, telegram_group_title, created_at` + a'zolar soni
2. **`updateFamily({ familyId, patch })`** — `name`, `telegram_group_id`, `telegram_group_title`
3. **`deleteFamily({ familyId })`** — oilani o'chirish (bog'liq jadvallar `family_id` bo'yicha kaskadli o'chiriladi: `relationships`, `family_members`, `family_settings`, `events`, `event_rsvps`, `memories`, `nominations`, `user_roles`, `join_requests`, `bot_integrations`, `messages_stats`, `member_warnings`, `banned_words`, `birthday_greetings`, `bot_broadcasts`, `notification_log`, `admin_notifications`, `action_logs`)
4. **`transferFamilyOwnership({ familyId, newOwnerUserId })`** — `families.owner_user_id` ni yangilash + yangi egaga `superadmin` roli berish (agar yo'q bo'lsa)

Har biri `action_logs`ga yozadi.

## UI — `src/routes/dashboard.families.tsx` (yangi)

Faqat superadmin sahifasi. Boshqalar kirsa — `/dashboard/tree`ga redirect.

Sahifada:
- Oilalar jadvali: nom, egasi, a'zolar soni, sana
- Har qatorda: **Tahrirlash** (modal: nom, telegram guruh) | **Egasini o'zgartirish** (modal: user_id input) | **O'chirish** (tasdiq dialog: oila nomini qayta yozish)

## Navigatsiya — `src/routes/dashboard.tsx`

- `useUserRole`ga `isSuperadmin` qo'shish
- `allTabs`ga `["/dashboard/families", "Oilalar", superadminOnly]` qo'shish
- `ADMIN_ONLY_PATHS` o'rniga `/dashboard/families`ni alohida `SUPERADMIN_ONLY_PATHS` ro'yxatiga qo'yish

## Tegilmaydi

- RLS policylar / DB migratsiya
- Oila admini uchun yangi UI (keyinroq)
- Rol/admin boshqaruvi sozlamalar sahifasida
