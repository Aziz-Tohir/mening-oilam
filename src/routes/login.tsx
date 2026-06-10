import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isAuthenticated, login, register } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Kirish — Shajara Admin" },
      { name: "description", content: "Shajara admin paneliga kiring yoki ro'yxatdan o'ting va oilaviy guruhingizni Telegram orqali boshqaring." },
      { property: "og:title", content: "Kirish — Shajara Admin" },
      { property: "og:description", content: "Shajara admin paneliga kirish va ro'yxatdan o'tish sahifasi." },
      { name: "robots", content: "noindex,follow" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) navigate({ to: "/dashboard" });
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Kirish amalga oshmadi");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(email, password);
      toast.success("Akkount yaratildi! Kirish amalga oshdi.");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err?.message ?? "Ro'yxatdan o'tish amalga oshmadi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">← Bosh sahifa</Link>
          <h1 className="sr-only">Kirish — Shajara Admin</h1>
          <CardTitle className="mt-2 text-2xl">🌳 Shajara — Admin panel</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Kirish</TabsTrigger>
              <TabsTrigger value="signup">Ro'yxatdan o'tish</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-3 pt-3">
                <div><Label htmlFor="signin-email">Email</Label><Input id="signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="signin-password">Parol</Label><Input id="signin-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>Kirish</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-3 pt-3">
                <div><Label htmlFor="signup-email">Email</Label><Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label htmlFor="signup-password">Parol (min 6)</Label><Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button type="submit" className="w-full" disabled={loading}>Ro'yxatdan o'tish</Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
