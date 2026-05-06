
-- Invite code
ALTER TABLE public.families ADD COLUMN IF NOT EXISTS invite_code text;
UPDATE public.families SET invite_code = upper(substr(md5(random()::text || id::text), 1, 8)) WHERE invite_code IS NULL;
ALTER TABLE public.families ALTER COLUMN invite_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS families_invite_code_idx ON public.families(invite_code);

-- Messages stats
CREATE TABLE IF NOT EXISTS public.messages_stats (
  id bigserial PRIMARY KEY,
  family_id uuid NOT NULL,
  member_id uuid,
  telegram_id bigint,
  message_date date NOT NULL,
  messages_count int NOT NULL DEFAULT 0,
  UNIQUE (family_id, telegram_id, message_date)
);
CREATE INDEX IF NOT EXISTS messages_stats_family_date_idx ON public.messages_stats(family_id, message_date);

ALTER TABLE public.messages_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view stats"
  ON public.messages_stats FOR SELECT
  USING (public.is_family_member(auth.uid(), family_id));
