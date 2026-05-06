CREATE TABLE public.birthday_greetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  member_id uuid NOT NULL,
  greeter_telegram_id bigint NOT NULL,
  greeter_name text,
  greeting_year int NOT NULL,
  greeting_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, greeter_telegram_id, greeting_year)
);

CREATE INDEX idx_bday_greetings_family_year ON public.birthday_greetings (family_id, greeting_year);

ALTER TABLE public.birthday_greetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view bday greetings" ON public.birthday_greetings
  FOR SELECT USING (is_family_member(auth.uid(), family_id));

CREATE POLICY "admins manage bday greetings" ON public.birthday_greetings
  FOR ALL USING (is_family_admin(auth.uid(), family_id))
  WITH CHECK (is_family_admin(auth.uid(), family_id));