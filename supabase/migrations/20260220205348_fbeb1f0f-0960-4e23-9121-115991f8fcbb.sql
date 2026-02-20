
-- =============================================
-- KANJERTRAINING OS - COMPLETE DATABASE SCHEMA
-- =============================================

-- 1. ROLE ENUM
CREATE TYPE public.app_role AS ENUM ('backoffice', 'trainer');

-- 2. BASE TABLES

-- Profiles (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles (separate table per security guidelines)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Areas (gebieden)
CREATE TABLE public.areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Neighborhoods (wijken)
CREATE TABLE public.neighborhoods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID REFERENCES public.areas(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Schools
CREATE TABLE public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id UUID REFERENCES public.neighborhoods(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  student_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff (links profiles to schools/roles for access control)
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  specialization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients (kinderen)
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  guardian_phone_alt TEXT,
  whatsapp_consent BOOLEAN DEFAULT false,
  notes TEXT,
  intake_status TEXT DEFAULT 'nieuw',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Programs (trainingsgroepen)
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  max_participants INTEGER DEFAULT 10,
  status TEXT DEFAULT 'gepland',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Program-Staff link (trainer assignment)
CREATE TABLE public.program_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE NOT NULL,
  staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'trainer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, staff_id)
);

-- Program-Clients link
CREATE TABLE public.program_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES public.programs(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  enrolled_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, client_id)
);

-- Referrers (verwijzers / school contacts)
CREATE TABLE public.referrers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  function_title TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audit Log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  viewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL NOT NULL,
  action TEXT NOT NULL DEFAULT 'view',
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. HELPER FUNCTIONS (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_backoffice()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'backoffice')
$$;

CREATE OR REPLACE FUNCTION public.is_trainer()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'trainer')
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_for_program(_program_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.program_staff ps
    JOIN public.staff s ON ps.staff_id = s.id
    WHERE ps.program_id = _program_id
      AND s.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_trainer_for_client(_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.program_clients pc
    JOIN public.program_staff ps ON pc.program_id = ps.program_id
    JOIN public.staff s ON ps.staff_id = s.id
    WHERE pc.client_id = _client_id
      AND s.user_id = auth.uid()
  )
$$;

-- 4. UPDATED_AT TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_areas_updated_at BEFORE UPDATE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_neighborhoods_updated_at BEFORE UPDATE ON public.neighborhoods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_programs_updated_at BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_referrers_updated_at BEFORE UPDATE ON public.referrers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. ENABLE RLS ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES

-- Profiles: users see/edit own profile
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- User roles: only backoffice can manage, users can read own
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Backoffice manages roles" ON public.user_roles FOR ALL TO authenticated USING (public.is_backoffice()) WITH CHECK (public.is_backoffice());

-- Areas: all staff can read, backoffice can manage
CREATE POLICY "Staff read areas" ON public.areas FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer());
CREATE POLICY "Backoffice manages areas" ON public.areas FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates areas" ON public.areas FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes areas" ON public.areas FOR DELETE TO authenticated USING (public.is_backoffice());

-- Neighborhoods: same as areas
CREATE POLICY "Staff read neighborhoods" ON public.neighborhoods FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer());
CREATE POLICY "Backoffice manages neighborhoods" ON public.neighborhoods FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates neighborhoods" ON public.neighborhoods FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes neighborhoods" ON public.neighborhoods FOR DELETE TO authenticated USING (public.is_backoffice());

-- Schools: all staff read, backoffice manages
CREATE POLICY "Staff read schools" ON public.schools FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer());
CREATE POLICY "Backoffice manages schools" ON public.schools FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates schools" ON public.schools FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes schools" ON public.schools FOR DELETE TO authenticated USING (public.is_backoffice());

-- Staff: backoffice manages, staff can see themselves
CREATE POLICY "Backoffice reads all staff" ON public.staff FOR SELECT TO authenticated USING (public.is_backoffice() OR auth.uid() = user_id);
CREATE POLICY "Backoffice manages staff" ON public.staff FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates staff" ON public.staff FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes staff" ON public.staff FOR DELETE TO authenticated USING (public.is_backoffice());

-- Clients: backoffice all, trainers own programs only
CREATE POLICY "Staff read clients" ON public.clients FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer_for_client(id));
CREATE POLICY "Backoffice manages clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates clients" ON public.clients FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes clients" ON public.clients FOR DELETE TO authenticated USING (public.is_backoffice());

-- Programs: backoffice all, trainers own programs
CREATE POLICY "Staff read programs" ON public.programs FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer_for_program(id));
CREATE POLICY "Backoffice manages programs" ON public.programs FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates programs" ON public.programs FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes programs" ON public.programs FOR DELETE TO authenticated USING (public.is_backoffice());

-- Program Staff
CREATE POLICY "Staff read program_staff" ON public.program_staff FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer_for_program(program_id));
CREATE POLICY "Backoffice manages program_staff" ON public.program_staff FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates program_staff" ON public.program_staff FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes program_staff" ON public.program_staff FOR DELETE TO authenticated USING (public.is_backoffice());

-- Program Clients
CREATE POLICY "Staff read program_clients" ON public.program_clients FOR SELECT TO authenticated USING (public.is_backoffice() OR public.is_trainer_for_program(program_id));
CREATE POLICY "Backoffice manages program_clients" ON public.program_clients FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates program_clients" ON public.program_clients FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes program_clients" ON public.program_clients FOR DELETE TO authenticated USING (public.is_backoffice());

-- Referrers: backoffice only
CREATE POLICY "Backoffice reads referrers" ON public.referrers FOR SELECT TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice manages referrers" ON public.referrers FOR INSERT TO authenticated WITH CHECK (public.is_backoffice());
CREATE POLICY "Backoffice updates referrers" ON public.referrers FOR UPDATE TO authenticated USING (public.is_backoffice());
CREATE POLICY "Backoffice deletes referrers" ON public.referrers FOR DELETE TO authenticated USING (public.is_backoffice());

-- Audit Log: backoffice reads all, trainers read own views, authenticated can insert
CREATE POLICY "Backoffice reads audit" ON public.audit_log FOR SELECT TO authenticated USING (public.is_backoffice() OR auth.uid() = viewed_by);
CREATE POLICY "Authenticated inserts audit" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = viewed_by);

-- INDEXES
CREATE INDEX idx_neighborhoods_area ON public.neighborhoods(area_id);
CREATE INDEX idx_schools_neighborhood ON public.schools(neighborhood_id);
CREATE INDEX idx_staff_user ON public.staff(user_id);
CREATE INDEX idx_clients_school ON public.clients(school_id);
CREATE INDEX idx_programs_school ON public.programs(school_id);
CREATE INDEX idx_program_staff_program ON public.program_staff(program_id);
CREATE INDEX idx_program_clients_program ON public.program_clients(program_id);
CREATE INDEX idx_program_clients_client ON public.program_clients(client_id);
CREATE INDEX idx_audit_log_client ON public.audit_log(client_id);
CREATE INDEX idx_audit_log_viewed_by ON public.audit_log(viewed_by);
CREATE INDEX idx_referrers_school ON public.referrers(school_id);
