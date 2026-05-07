import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

// Resolve highest role for the current user using admin client so global
// superadmin rows (family_id = NULL) are visible.
export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const db = getAdminDb();
    const { data, error } = await db
      .from("user_roles")
      .select("role, family_id")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const order = ["superadmin", "admin", "moderator", "member"] as const;
    const rows = (data ?? []) as { role: typeof order[number]; family_id: string | null }[];
    const best = rows.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))[0];
    return {
      role: best?.role ?? null,
      familyId: best?.family_id ?? null,
      roles: rows,
    };
  });
