Topilgan dalillar:
- Bazada hozir bitta oila bor: `Usmonovlar`, `Weekand` guruhiga ulangan.
- Bot guruhga qo‘shilganda avval to‘g‘ri ulangan, lekin admin qilinganda `my_chat_member` yana kelib, kod `linkedFamilyId` topmagani uchun “hali oilaga bog‘lanmagan” xabarini qayta yuboryapti.
- Superadmin global roli `family_id = null` bo‘lgan user uchun `useUserRole` va `assertSuperadmin` ishlashi notekis: `user_roles` RLS siyosati `family_id = null` qatorni ko‘rsatmaydi, shuning uchun admin UI ba’zan loading/permission muammosiga tushadi.
- Mini App “profile mavjud emas” holati ehtimol auth user/profiles/family_members bog‘lanishi va eski `telegram.local` userlarni topish logikasidagi bo‘shliqlardan kelmoqda.

Reja:
1. Superadmin rolini barqaror qilish
   - `assertSuperadmin` server tekshiruvini admin client orqali tekshiradigan qilaman, shunda global superadmin `family_id = null` bo‘lsa ham admin funksiyalar ishlaydi.
   - `useUserRole` uchun server-side role resolver qo‘shaman yoki mavjud tekshiruvni RLSga bog‘liq bo‘lmaydigan qilaman.
   - `listMyFamilies`da global superadmin bo‘lsa barcha oilalarni qaytarish imkonini qo‘shaman, shunda dashboard select bo‘sh qolmaydi.

2. Doimiy loadingni to‘xtatish
   - `useCachedServer` xatoda ham `loading=false` qilib, xatoni UIga qaytaradigan holatni aniq qilaman.
   - Settings/tree/stats kabi oila select ishlatadigan sahifalarda “oila yo‘q”, “xatolik”, “yuklanmoqda” holatlarini ajrataman.

3. Mini App profil bog‘lanishini mustahkamlash
   - `miniapp-auth` Telegram ID bo‘yicha `family_members`, `profiles`, mavjud `tg<id>@telegram.local` user va web user profillarini izchil bog‘laydigan qilaman.
   - Agar user oilani web/bot orqali yaratgan bo‘lsa, Mini App kirishda `family_members` va `user_roles` avtomatik idempotent tiklanadi.
   - “Profile mavjud emas” o‘rniga aniqroq xabar qaytariladi: avval botda `/start`, yoki admin tasdig‘i kutilmoqda.

4. Telegram guruh admin qilinganda noto‘g‘ri “bog‘lanmagan” xabarini tuzatish
   - `handleMyChatMember` boshida chat ID bo‘yicha mavjud oilani tekshiraman.
   - Agar guruh allaqachon ulangan bo‘lsa, admin/member status o‘zgarishida `bot_added_to_group` emas, masalan `bot_status_updated` log yoziladi va “bog‘lanmagan” prompt yuborilmaydi.
   - Auto-linkdan keyin group cache invalidation qo‘shaman, shunda keyingi xabarlar eski “ulanmagan” keshga tushmaydi.

5. Tekshirish
   - Bazadan oilalar, rollar, memberlar va oxirgi Telegram update/loglarni qayta o‘qib tasdiqlayman.
   - Server funksiyalarda `/dashboard/families` va oila select uchun kerakli ma’lumot qaytishini tekshiraman.