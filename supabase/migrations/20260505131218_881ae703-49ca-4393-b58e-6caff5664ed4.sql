
-- RSVP enum
CREATE TYPE public.rsvp_status AS ENUM ('yes','no','maybe');

-- Events
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  event_at TIMESTAMPTZ NOT NULL,
  location TEXT,
  is_recurring_yearly BOOLEAN NOT NULL DEFAULT false,
  notify_days_before INT[] NOT NULL DEFAULT ARRAY[7,1,0],
  notify_group BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_family_date ON public.events(family_id, event_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view events" ON public.events
  FOR SELECT USING (is_family_member(auth.uid(), family_id));

CREATE POLICY "admins manage events" ON public.events
  FOR ALL USING (is_family_admin(auth.uid(), family_id))
  WITH CHECK (is_family_admin(auth.uid(), family_id));

CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RSVPs
CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  member_id UUID NOT NULL,
  status rsvp_status NOT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_id)
);
CREATE INDEX idx_rsvps_event ON public.event_rsvps(event_id);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view rsvps" ON public.event_rsvps
  FOR SELECT USING (is_family_member(auth.uid(), family_id));

CREATE POLICY "admins manage rsvps" ON public.event_rsvps
  FOR ALL USING (is_family_admin(auth.uid(), family_id))
  WITH CHECK (is_family_admin(auth.uid(), family_id));

-- Notification dedupe log
CREATE TABLE public.notification_log (
  id BIGSERIAL PRIMARY KEY,
  family_id UUID NOT NULL,
  kind VARCHAR(40) NOT NULL,        -- 'birthday' | 'event_reminder'
  ref_id UUID NOT NULL,             -- event.id or member.id
  notify_date DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_id, notify_date)
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view notif log" ON public.notification_log
  FOR SELECT USING (is_family_admin(auth.uid(), family_id));
