import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdminDb } from "./db.server";

export const exportFamilyTreeJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ familyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const admin = getAdminDb();

    // Authz: must be admin/superadmin
    const { data: role } = await admin.from("user_roles")
      .select("role").eq("family_id", data.familyId).eq("user_id", userId)
      .in("role", ["admin", "superadmin"]).maybeSingle();
    if (!role) throw new Error("Faqat adminlar eksport qila oladi");

    const { data: family } = await admin.from("families")
      .select("id, name, telegram_group_title, created_at, invite_code")
      .eq("id", data.familyId).maybeSingle();
    const { data: members } = await admin.from("family_members")
      .select("id, full_name, gender, birth_date, phone, username, telegram_id, status, photo_url, bio, joined_at, relationship_to_inviter, invited_by")
      .eq("family_id", data.familyId);
    const { data: relationships } = await admin.from("relationships")
      .select("id, member_id_1, member_id_2, relationship_type, created_at")
      .eq("family_id", data.familyId);

    return {
      exported_at: new Date().toISOString(),
      version: 1,
      family,
      members: members ?? [],
      relationships: relationships ?? [],
    };
  });
