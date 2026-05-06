CREATE OR REPLACE FUNCTION public.apply_female_photo_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  policy text;
BEGIN
  IF NEW.gender = 'female' THEN
    SELECT female_photo_visibility INTO policy
    FROM public.family_settings WHERE family_id = NEW.family_id;
    IF policy = 'private_default' THEN
      IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND COALESCE(OLD.gender::text, '') <> 'female') THEN
        NEW.photo_is_private := true;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_female_photo_default ON public.family_members;
CREATE TRIGGER trg_female_photo_default
BEFORE INSERT OR UPDATE OF gender ON public.family_members
FOR EACH ROW EXECUTE FUNCTION public.apply_female_photo_default();