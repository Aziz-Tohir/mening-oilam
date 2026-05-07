CREATE OR REPLACE FUNCTION public.is_global_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'superadmin' AND family_id IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(_user_id uuid, _family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (family_id = _family_id AND role IN ('admin','superadmin'))
        OR (family_id IS NULL AND role = 'superadmin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_member(_user_id uuid, _family_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        family_id = _family_id
        OR (family_id IS NULL AND role = 'superadmin')
      )
  );
$$;