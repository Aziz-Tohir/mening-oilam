import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mening Oilam" },
      { name: "description", content: "Create and manage Telegram bots with custom features and web interfaces." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Mening Oilam" },
      { property: "og:description", content: "Create and manage Telegram bots with custom features and web interfaces." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Mening Oilam" },
      { name: "twitter:description", content: "Create and manage Telegram bots with custom features and web interfaces." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/376b5e5e-3e7d-450f-9122-5de4681bc8f5/id-preview-003947ee--858ca73f-22bf-4369-b9d0-1671ce37994d.lovable.app-1777988893874.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/376b5e5e-3e7d-450f-9122-5de4681bc8f5/id-preview-003947ee--858ca73f-22bf-4369-b9d0-1671ce37994d.lovable.app-1777988893874.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://telegram.org", crossOrigin: "anonymous" },
      { rel: "preconnect", href: "https://cdn.gpteng.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://telegram.org" },
      { rel: "dns-prefetch", href: "https://cdn.gpteng.co" },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
    scripts: [
      { src: "https://telegram.org/js/telegram-web-app.js", defer: true },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
