ALTER TABLE public.family_settings ALTER COLUMN manage_foreign_bot_media SET DEFAULT true;
UPDATE public.family_settings SET manage_foreign_bot_media = true WHERE manage_foreign_bot_media = false;