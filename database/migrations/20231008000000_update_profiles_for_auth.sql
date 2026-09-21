-- 1. Rename 'buyer' enum value to 'customer' to match requirements
ALTER TYPE public.user_role RENAME VALUE 'buyer' TO 'customer';

-- 2. Alter profiles table to match requested schema
ALTER TABLE public.profiles
  DROP COLUMN first_name,
  DROP COLUMN last_name,
  ADD COLUMN full_name TEXT,
  ADD COLUMN avatar_url TEXT,
  ALTER COLUMN role SET DEFAULT 'customer'::public.user_role;

-- 3. Update RLS on profiles: Make SELECT public (authenticated users)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
  FOR SELECT
  USING (true);

-- 4. Replace the handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    'customer'::public.user_role -- Hardcode default to prevent privilege escalation
  );
  RETURN new;
END;
$$;
