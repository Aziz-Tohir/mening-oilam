
GRANT EXECUTE ON FUNCTION public.is_family_member(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_family_admin(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO anon, authenticated;
