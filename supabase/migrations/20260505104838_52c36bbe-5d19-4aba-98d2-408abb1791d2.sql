
-- ============= ENUMS =============
CREATE TYPE public.app_role AS ENUM ('superadmin', 'admin', 'member');
CREATE TYPE public.gender_type AS ENUM ('male', 'female');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'blocked');
CREATE TYPE public.relationship_type AS ENUM (
  'father','mother','son','daughter','brother','sister',
  'husband','wife',
  'uncle_paternal','uncle_maternal','aunt_paternal','aunt_maternal',
  'cousin_male','cousin_female',
  'grandfather','grandmother','grandson','granddaughter',
  'father_in_law','mother_in_law','son_in_law','daughter_in_law',
  'brother_in_law','sister_in_law',
  'nephew','niece',
  'other'
);
CREATE TYPE public.join_request_status AS ENUM (
  'awaiting_relative_choice','awaiting_relative_confirm',
  'awaiting_admin_approval','approved','rejected','expired'
);
CREATE TYPE public.bot_integration_mode AS ENUM ('media_only','delete_all','keep_all');
CREATE TYPE public.notification_type AS ENUM (
  'join_request','approval_needed','spam_detected','error_report','system'
);

-- ============= UTILITY FUNCTIONS =============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============= PROFILES (auth users) =============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  telegram_id BIGINT UNIQUE,
  telegram_username TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============= FAMILIES =============
CREATE TABLE public.families (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  telegram_group_id BIGINT UNIQUE,
  telegram_group_title TEXT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_families_updated BEFORE UPDATE ON public.families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= USER ROLES (per-family) =============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, family_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role: SECURITY DEFINER to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _family_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND family_id = _family_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_admin(_user_id UUID, _family_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND family_id = _family_id
      AND role IN ('admin','superadmin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_family_member(_user_id UUID, _family_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND family_id = _family_id
  );
$$;

-- ============= FAMILY MEMBERS (Telegram users in a family) =============
CREATE TABLE public.family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  username VARCHAR(64),
  full_name VARCHAR(128) NOT NULL,
  gender public.gender_type,
  birth_date DATE,
  phone VARCHAR(20),
  bio TEXT,
  photo_url TEXT,
  photo_is_private BOOLEAN NOT NULL DEFAULT false,
  status public.member_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  relationship_to_inviter public.relationship_type,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, telegram_id)
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_family_members_family ON public.family_members(family_id);
CREATE INDEX idx_family_members_telegram ON public.family_members(telegram_id);
CREATE TRIGGER trg_family_members_updated BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= RELATIONSHIPS =============
CREATE TABLE public.relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id_1 UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  member_id_2 UUID NOT NULL REFERENCES public.family_members(id) ON DELETE CASCADE,
  relationship_type public.relationship_type NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (member_id_1 <> member_id_2)
);
CREATE UNIQUE INDEX idx_relationships_unique
  ON public.relationships (LEAST(member_id_1, member_id_2), GREATEST(member_id_1, member_id_2), relationship_type);
CREATE INDEX idx_relationships_family ON public.relationships(family_id);
CREATE INDEX idx_relationships_m1 ON public.relationships(member_id_1);
CREATE INDEX idx_relationships_m2 ON public.relationships(member_id_2);
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- ============= JOIN REQUESTS =============
CREATE TABLE public.join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  applicant_telegram_id BIGINT NOT NULL,
  applicant_username VARCHAR(64),
  applicant_full_name VARCHAR(128),
  applicant_phone VARCHAR(20),
  relative_member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  relative_hint TEXT,
  relationship_type public.relationship_type,
  status public.join_request_status NOT NULL DEFAULT 'awaiting_relative_choice',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_join_requests_family ON public.join_requests(family_id);
CREATE INDEX idx_join_requests_status ON public.join_requests(status);
CREATE TRIGGER trg_join_requests_updated BEFORE UPDATE ON public.join_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= BOT INTEGRATIONS =============
CREATE TABLE public.bot_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  bot_username VARCHAR(64) NOT NULL,
  mode public.bot_integration_mode NOT NULL DEFAULT 'media_only',
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, bot_username)
);
ALTER TABLE public.bot_integrations ENABLE ROW LEVEL SECURITY;

-- ============= FAMILY SETTINGS =============
CREATE TABLE public.family_settings (
  family_id UUID PRIMARY KEY REFERENCES public.families(id) ON DELETE CASCADE,
  language VARCHAR(8) NOT NULL DEFAULT 'uz',
  birthday_notify_time TIME NOT NULL DEFAULT '09:00',
  welcome_message_auto_delete_seconds INT NOT NULL DEFAULT 120,
  delete_join_leave_messages BOOLEAN NOT NULL DEFAULT true,
  soft_moderation_enabled BOOLEAN NOT NULL DEFAULT true,
  join_request_auto_approve_timeout_hours INT NOT NULL DEFAULT 0,
  join_request_auto_reject_timeout_hours INT NOT NULL DEFAULT 0,
  feature_birthdays BOOLEAN NOT NULL DEFAULT true,
  feature_events BOOLEAN NOT NULL DEFAULT true,
  feature_stats_public BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.family_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_family_settings_updated BEFORE UPDATE ON public.family_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= ACTION LOGS =============
CREATE TABLE public.action_logs (
  id BIGSERIAL PRIMARY KEY,
  family_id UUID REFERENCES public.families(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id),
  actor_telegram_id BIGINT,
  action VARCHAR(64) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_action_logs_family ON public.action_logs(family_id, created_at DESC);

-- ============= ADMIN NOTIFICATIONS =============
CREATE TABLE public.admin_notifications (
  id BIGSERIAL PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES auth.users(id),
  notification_type public.notification_type NOT NULL,
  message_text TEXT NOT NULL,
  related_join_request UUID REFERENCES public.join_requests(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_admin_notifications_family ON public.admin_notifications(family_id, is_read);

-- ============= TELEGRAM BOT STATE =============
CREATE TABLE public.telegram_bot_state (
  id INT PRIMARY KEY DEFAULT 1,
  update_offset BIGINT NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMPTZ,
  CHECK (id = 1)
);
ALTER TABLE public.telegram_bot_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.telegram_bot_state (id, update_offset) VALUES (1, 0);

-- ============= TELEGRAM UPDATES RAW =============
CREATE TABLE public.telegram_updates_raw (
  update_id BIGINT PRIMARY KEY,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_updates_raw ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_telegram_updates_unprocessed ON public.telegram_updates_raw(processed_at) WHERE processed_at IS NULL;

-- ============= RLS POLICIES =============

-- profiles
CREATE POLICY "users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- families: members can see; owner can edit; anyone can create
CREATE POLICY "members view own family" ON public.families
  FOR SELECT USING (public.is_family_member(auth.uid(), id) OR owner_user_id = auth.uid());
CREATE POLICY "anyone authed can create family" ON public.families
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "owner/admin can update family" ON public.families
  FOR UPDATE USING (owner_user_id = auth.uid() OR public.is_family_admin(auth.uid(), id));
CREATE POLICY "owner can delete family" ON public.families
  FOR DELETE USING (owner_user_id = auth.uid());

-- user_roles
CREATE POLICY "members view roles in family" ON public.user_roles
  FOR SELECT USING (public.is_family_member(auth.uid(), family_id) OR user_id = auth.uid());
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id));

-- family_members
CREATE POLICY "family members view members" ON public.family_members
  FOR SELECT USING (public.is_family_member(auth.uid(), family_id));
CREATE POLICY "members update own record" ON public.family_members
  FOR UPDATE USING (user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id));
CREATE POLICY "admins manage members" ON public.family_members
  FOR ALL USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id));

-- relationships
CREATE POLICY "family members view relationships" ON public.relationships
  FOR SELECT USING (public.is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage relationships" ON public.relationships
  FOR ALL USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id));

-- join_requests
CREATE POLICY "admins view join requests" ON public.join_requests
  FOR SELECT USING (public.is_family_admin(auth.uid(), family_id));
CREATE POLICY "admins update join requests" ON public.join_requests
  FOR UPDATE USING (public.is_family_admin(auth.uid(), family_id));

-- bot_integrations
CREATE POLICY "members view bot integrations" ON public.bot_integrations
  FOR SELECT USING (public.is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage bot integrations" ON public.bot_integrations
  FOR ALL USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id));

-- family_settings
CREATE POLICY "members view settings" ON public.family_settings
  FOR SELECT USING (public.is_family_member(auth.uid(), family_id));
CREATE POLICY "admins manage settings" ON public.family_settings
  FOR ALL USING (public.is_family_admin(auth.uid(), family_id))
  WITH CHECK (public.is_family_admin(auth.uid(), family_id));

-- action_logs
CREATE POLICY "admins view logs" ON public.action_logs
  FOR SELECT USING (family_id IS NULL OR public.is_family_admin(auth.uid(), family_id));

-- admin_notifications
CREATE POLICY "admins view own notifications" ON public.admin_notifications
  FOR SELECT USING (admin_user_id = auth.uid() OR public.is_family_admin(auth.uid(), family_id));
CREATE POLICY "admins update own notifications" ON public.admin_notifications
  FOR UPDATE USING (admin_user_id = auth.uid());

-- telegram_bot_state, telegram_updates_raw: NO public access (service role only)
-- (RLS enabled, no policies = denied to non-service callers)
