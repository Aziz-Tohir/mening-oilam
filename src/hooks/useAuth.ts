import { useCallback, useEffect, useState } from "react";
import { clearTokens, isAuthenticated, logout, me, onAuthChange } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  display_name?: string | null;
  telegram_id?: number | null;
  role?: string | null;
  family_id?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data: any = await me();
      setUser({
        id: data.user_id,
        email: data.email,
        display_name: data.display_name,
        telegram_id: data.telegram_id,
        role: data.role,
        family_id: data.family_id,
      });
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    const unsub = onAuthChange(() => { loadUser(); });
    return () => unsub();
  }, [loadUser]);

  const signOut = useCallback(async () => {
    try { await logout(); } catch { clearTokens(); }
    setUser(null);
  }, []);

  return { user, loading, signOut };
}
