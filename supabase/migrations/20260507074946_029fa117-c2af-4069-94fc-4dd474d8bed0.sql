ALTER TABLE public.user_roles ALTER COLUMN family_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_global_superadmin_uniq
  ON public.user_roles(user_id) WHERE family_id IS NULL AND role = 'superadmin';