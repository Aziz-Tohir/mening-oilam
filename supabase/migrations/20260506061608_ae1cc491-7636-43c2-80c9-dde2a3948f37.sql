ALTER TABLE public.family_settings
  ADD COLUMN IF NOT EXISTS log_topic_actions integer,
  ADD COLUMN IF NOT EXISTS log_topic_admin integer,
  ADD COLUMN IF NOT EXISTS log_topic_moderation integer,
  ADD COLUMN IF NOT EXISTS log_topic_backup integer;