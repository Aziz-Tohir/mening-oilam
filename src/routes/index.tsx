import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shajara — Oilaviy hub va Telegram bot" },
      { name: "description", content: "Oilaviy aloqalarni mustahkamlovchi Telegram bot va admin panel: shajara, xavfsiz onboarding, guruh moderatsiyasi." },
      { property: "og:title", content: "Shajara — Oilaviy hub" },
      { property: "og:description", content: "Telegram orqali oilaviy guruhni boshqaring va shajarani saqlang." },
      { property: "og:url", content: "https://mening-oilam.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://mening-oilam.lovable.app/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Shajara",
          description: "Oilaviy aloqalarni mustahkamlovchi Telegram bot va admin panel.",
          applicationCategory: "SocialNetworkingApplication",
          operatingSystem: "Web, Telegram",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Shajara",
          url: "https://mening-oilam.lovable.app/",
        }),
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌳</span>
            <span className="font-semibold tracking-tight">Shajara</span>
          </div>
          <Link to="/login">
            <Button variant="default">Kirish</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-balance text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Oilaviy aloqalarni mustahkamlovchi <span className="text-primary">Telegram bot</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:mt-6 sm:text-lg">
            Shajara — bu yopiq oilaviy guruhlar uchun yaratilgan boshqaruv va shajara tizimi.
            Xavfsiz onboarding, qarindoshlik aloqalari va admin paneli bir joyda.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:mt-10 sm:flex-row">
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">Boshlash</Button>
            </Link>
            <a href="#features" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">Imkoniyatlar</Button>
            </a>
          </div>
        </section>

        <section id="features" className="mt-16 sm:mt-24">
          <h2 className="sr-only">Imkoniyatlar</h2>
          <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
          {[
            { icon: "🔐", title: "Xavfsiz onboarding", desc: "Yangi a'zo qarindoshi va admin tasdig'idan keyingina guruhga qo'shiladi." },
            { icon: "🌳", title: "Oila shajarasi", desc: "Har bir a'zo va ular orasidagi qarindoshlik aloqalari saqlanadi." },
            { icon: "🛡️", title: "Guruh moderatsiyasi", desc: "Kirdi-chiqdi xabarlari va begona bot xabarlari avtomatik tozalanadi." },
            { icon: "👥", title: "Multi-family", desc: "Bir tizimda bir nechta oila — har biri o'z guruhi va sozlamalari bilan." },
            { icon: "⚙️", title: "Admin paneli", desc: "A'zolar, so'rovlar, sozlamalar va loglarni veb interfeysdan boshqaring." },
            { icon: "📲", title: "Telegram-native", desc: "Foydalanuvchilar uchun hech qanday qo'shimcha ilova kerak emas." },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="text-3xl">{f.icon}</div>
              <h3 className="mt-3 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 py-8 text-center text-sm text-muted-foreground">
        © Shajara · Family Hub
      </footer>
    </div>
  );
}
