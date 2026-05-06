-- Memories
CREATE TABLE public.memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  saved_by_telegram_id bigint,
  saved_by_member_id uuid,
  kind text NOT NULL CHECK (kind IN ('photo','video','document')),
  telegram_file_id text NOT NULL,
  storage_url text,
  caption text,
  message_year int NOT NULL DEFAULT extract(year from now())::int,
  source_chat_id bigint,
  source_message_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_memories_family_year ON public.memories (family_id, message_year);
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view memories" ON public.memories FOR SELECT USING (is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage memories" ON public.memories FOR ALL USING (is_family_admin(auth.uid(), family_id)) WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Nominations / Awards
CREATE TABLE public.nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  year int NOT NULL,
  category text NOT NULL,
  member_id uuid,
  member_name text,
  metric_value numeric,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, year, category)
);
ALTER TABLE public.nominations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view nominations" ON public.nominations FOR SELECT USING (is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage nominations" ON public.nominations FOR ALL USING (is_family_admin(auth.uid(), family_id)) WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Sentiment scoring on stats
ALTER TABLE public.messages_stats
  ADD COLUMN IF NOT EXISTS sentiment_score numeric,
  ADD COLUMN IF NOT EXISTS sentiment_analyzed_at timestamptz;

-- Family settings additions
ALTER TABLE public.family_settings
  ADD COLUMN IF NOT EXISTS log_telegram_chat_id bigint,
  ADD COLUMN IF NOT EXISTS admin_notification_channel_id bigint,
  ADD COLUMN IF NOT EXISTS backup_telegram_chat_id bigint,
  ADD COLUMN IF NOT EXISTS backup_frequency text NOT NULL DEFAULT 'weekly';

-- Broadcast gender filter
ALTER TABLE public.bot_broadcasts
  ADD COLUMN IF NOT EXISTS gender_filter text;