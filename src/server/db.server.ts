// Service-role Supabase client for trusted server operations (bot, webhooks, polling).
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _admin: ReturnType<typeof createClient<Database>> | null = null;

export function getAdminDb() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin env vars missing");
  _admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}
