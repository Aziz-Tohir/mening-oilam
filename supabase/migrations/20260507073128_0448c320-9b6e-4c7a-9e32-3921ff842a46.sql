
ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS sentiment_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.daily_message_buffer (
  id bigserial PRIMARY KEY,
  family_id uuid NOT NULL,
  telegram_id bigint NOT NULL,
  member_id uuid,
  message_date date NOT NULL,
  text text NOT NULL,
  text_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dmb_family_date ON public.daily_message_buffer (family_id, message_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dmb_dedupe ON public.daily_message_buffer (family_id, telegram_id, message_date, text_hash);

ALTER TABLE public.daily_message_buffer ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny all to clients dmb" ON public.daily_message_buffer;
CREATE POLICY "deny all to clients dmb" ON public.daily_message_buffer
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
