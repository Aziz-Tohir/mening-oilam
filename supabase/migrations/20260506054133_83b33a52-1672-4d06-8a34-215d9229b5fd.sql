
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language varchar(10);
ALTER TABLE public.family_settings ADD COLUMN IF NOT EXISTS manage_foreign_bot_media boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bot_sessions (
  telegram_id bigint PRIMARY KEY,
  step varchar(60) NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny all to clients bot_sessions" ON public.bot_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
