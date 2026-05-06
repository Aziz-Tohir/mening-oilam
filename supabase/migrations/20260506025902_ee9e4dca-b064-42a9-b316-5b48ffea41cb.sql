ALTER TABLE public.family_settings
ADD COLUMN IF NOT EXISTS female_photo_visibility text NOT NULL DEFAULT 'public'
CHECK (female_photo_visibility IN ('public','private_default','female_only','always_hidden'));