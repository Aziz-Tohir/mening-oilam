import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";
import { getMyRole } from "@/services/role.functions";

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
      try {
        const res = await getMyRole();
        if (cancelled) return;
        setRole((res?.role as AppRole) ?? "member");
        setFamilyId(res?.familyId ?? null);
      } catch {
        if (!cancelled) { setRole("member"); setFamilyId(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user, authLoading]);

  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";
  return { role, familyId, isAdmin, isSuperadmin, loading: loading || authLoading };
}
