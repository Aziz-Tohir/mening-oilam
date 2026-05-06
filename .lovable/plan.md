## Maqsad

Hozir ma'lumotlar 30 daqiqa keshlanadi. Foydalanuvchi xohlaganda darhol yangilash uchun har bir bo'limda alohida "Yangilash" tugmasi bo'lsin.

## Yondashuv

`CacheStatus` komponentiga ixtiyoriy `onRefresh` va `refreshing` proplarini qo'shaman. Agar `onRefresh` berilgan bo'lsa, status yonida kichik aylanma ikonkali tugma chiqadi. Bosilganda `refetch()` chaqiriladi va kesh yangilanadi.

Shu bilan har bir bo'limda dizayn bir xil ko'rinadi va kod takrorlanmaydi.

## O'zgarishlar

### 1. `src/components/CacheStatus.tsx`
- Yangi proplar: `onRefresh?: () => void | Promise<void>`.
- `loading` holatida tugma o'chiq (disabled) va aylanayotgan ikonka.
- `lucide-react` dan `RefreshCw` ikonkasi.

### 2. Bo'limlarda `onRefresh` ulash (har bir tab uchun alohida)

Quyidagi sahifalarda har bir kartochka/blok yonidagi `<CacheStatus />` ga `onRefresh={() => { invalidateCache('<key>'); refetch(); }}` qo'shiladi:

- **`src/routes/dashboard.events.tsx`** — ikkita: tug'ilgan kunlar (`bdays:${familyId}`) va tadbirlar (`events:${familyId}`). Hozir `bdays` uchun `refetch` ishlatilmagan — `useCachedServer` chaqirig'ida `refetch: refetchBdays` ham olinadi.
- **`src/routes/dashboard.members.tsx`** — a'zolar ro'yxati (`members:${familyId}`).
- **`src/routes/dashboard.tree.tsx`** — shajara va boshqa keshlangan bloklar.
- **`src/routes/dashboard.profile.tsx`** — profil ma'lumotlari.
- **`src/routes/dashboard.index.tsx`** — bosh sahifa kartochkalari.

### 3. `dashboard.requests.tsx`
Hozir `useCachedServer` ishlatmaydi — uni ham boshqa sahifalar singari `useCachedServer` ga o'tkazaman va yangilash tugmasini qo'shaman, shunda barcha tablar bir xil ishlaydi.

## Texnik tafsilotlar

`CacheStatus` interfeysi:
```ts
{ ts, stale, loading, onRefresh? }
```
Tugma `button` sifatida `aria-label="Yangilash"`, `loading` paytida `animate-spin`. Bosilganda `invalidateCache(key)` + `refetch()` ketma-ket chaqiriladi (har sahifada o'sha kalit bilan).

Boshqa narsa o'zgarmaydi — 30 daqiqalik kesh, SWR mantig'i o'sha-o'sha.
