-- ==============================================================================
-- 🏗️ MULTI-VENDOR MARKETPLACE FOUNDATION SCHEMA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- ENUMS
-- ==============================================================================
CREATE TYPE public.user_role AS ENUM ('buyer', 'vendor', 'vendor_staff', 'admin', 'super_admin');

-- ==============================================================================
-- TABLES
-- ==============================================================================

-- PROFILES
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'buyer'::public.user_role,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- AUTHORIZATION HELPERS
-- ==============================================================================

-- Check if user is admin/super_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(check_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = check_user_id AND role IN ('admin', 'super_admin')
  );
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.is_admin_or_super_admin(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin_or_super_admin(auth.uid()));

-- ==============================================================================
-- TRIGGERS & SECURITY COLUMN PROTECTION
-- ==============================================================================

-- Auto-create profile on Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, phone, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.phone, new.raw_user_meta_data->>'phone'),
    'buyer'::public.user_role
  );
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Protect 'role' column from non-admin updates
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can change roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_profile_role_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role_update();

-- ==============================================================================
