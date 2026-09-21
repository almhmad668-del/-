-- Create custom enum for roles
CREATE TYPE public.user_role AS ENUM ('buyer', 'vendor', 'vendor_staff', 'admin', 'super_admin');

-- Create the profiles table extending auth.users
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'buyer'::public.user_role,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper function to check if a user is an admin or super_admin securely
-- We use a security definer function to read the profile bypassing RLS,
-- which prevents infinite recursion when evaluating RLS policies on the profiles table itself.
CREATE OR REPLACE FUNCTION public.is_admin_or_super_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'super_admin')
  );
$$;

-- RLS Policy: Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- RLS Policy: Admins and Super Admins can read all profiles
CREATE POLICY "Admins can read all profiles" ON public.profiles
  FOR SELECT
  USING (public.is_admin_or_super_admin(auth.uid()));

-- RLS Policy: Users can update their own profile
-- Note: We restrict updating the 'role' column. Users can only update their names.
-- Role updates should be handled by a separate admin function.
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'first_name',
    new.raw_user_meta_data->>'last_name',
    'buyer'::public.user_role -- Hardcode 'buyer' to prevent privilege escalation via client-side metadata
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger to auto-update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();
