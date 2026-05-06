CREATE TABLE IF NOT EXISTS public.pending_avatar_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL,
  file_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pending_avatar_tg ON public.pending_avatar_uploads(telegram_id);
ALTER TABLE public.pending_avatar_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all" ON public.pending_avatar_uploads FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);