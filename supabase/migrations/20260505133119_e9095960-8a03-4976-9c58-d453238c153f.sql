
-- Internal telegram tables: only service_role should access. Add deny-all policy to satisfy linter.
CREATE POLICY "deny all to clients" ON public.telegram_bot_state FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "deny all to clients" ON public.telegram_updates_raw FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

-- Restrict SECURITY DEFINER helper functions: only callable from server-side (postgres/service_role)
REVOKE EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_family_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
