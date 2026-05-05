
-- Warnings
CREATE TABLE public.member_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  member_id uuid NOT NULL,
  telegram_id bigint,
  reason text NOT NULL,
  issued_by_user_id uuid,
  issued_by_telegram_id bigint,
  auto boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_member_warnings_family_member ON public.member_warnings(family_id, member_id, created_at DESC);
ALTER TABLE public.member_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view warnings" ON public.member_warnings FOR SELECT USING (is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage warnings" ON public.member_warnings FOR ALL USING (is_family_admin(auth.uid(), family_id)) WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Banned words/phrases
CREATE TABLE public.banned_words (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  pattern text NOT NULL,
  is_regex boolean NOT NULL DEFAULT false,
  action varchar(16) NOT NULL DEFAULT 'delete', -- delete | warn | kick
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_banned_words_family ON public.banned_words(family_id);
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view banned" ON public.banned_words FOR SELECT USING (is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage banned" ON public.banned_words FOR ALL USING (is_family_admin(auth.uid(), family_id)) WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Broadcast history
CREATE TABLE public.bot_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  target varchar(16) NOT NULL, -- group | members | all
  message_text text NOT NULL,
  sent_by_user_id uuid,
  recipients_count integer NOT NULL DEFAULT 0,
  failures_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bot_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view broadcasts" ON public.bot_broadcasts FOR SELECT USING (is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage broadcasts" ON public.bot_broadcasts FOR ALL USING (is_family_admin(auth.uid(), family_id)) WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Family settings extensions
ALTER TABLE public.family_settings
  ADD COLUMN IF NOT EXISTS anti_link boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anti_forward boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS anti_flood_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_warnings integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS warning_action varchar(16) NOT NULL DEFAULT 'kick', -- kick | ban | mute
  ADD COLUMN IF NOT EXISTS allowed_link_domains text[] NOT NULL DEFAULT ARRAY[]::text[];
