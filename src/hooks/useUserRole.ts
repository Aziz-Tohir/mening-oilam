import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "superadmin" | "admin" | "moderator" | "member";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRole(null); setFamilyId(null); setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role, family_id")
        .eq("user_id", user.id)
        .order("role", { ascending: true });
      if (cancelled) return;
      const rows = (data ?? []) as { role: AppRole; family_id: string }[];
      // Pick the highest role across families (superadmin > admin > moderator > member).
      const order: AppRole[] = ["superadmin", "admin", "moderator", "member"];
      const best = rows.sort(
        (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
      )[0];
      setRole(best?.role ?? "member");
      setFamilyId(best?.family_id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";
  return { role, familyId, isAdmin, isSuperadmin, loading: loading || authLoading };
}
