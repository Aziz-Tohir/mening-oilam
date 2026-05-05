CREATE TABLE IF NOT EXISTS public.kinship_sessions (
  user_telegram_id BIGINT PRIMARY KEY,
  family_id UUID,
  first_member_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kinship_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all" ON public.kinship_sessions FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);