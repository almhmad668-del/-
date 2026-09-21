-- Protect the 'role' column in profiles table
-- Prevents authenticated users from elevating their own privileges
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- If the role is being changed
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Only allow the change if the user performing it is an admin/super_admin
    -- Or if it's the system (e.g., service_role bypassing RLS)
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can change roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_profile_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_profile_role_update();

-- Protect the 'default_commission_rate' column in vendors table
-- Prevents vendors from reducing their fee obligations
CREATE OR REPLACE FUNCTION public.protect_vendor_commission_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- If the commission rate is being changed
  IF NEW.default_commission_rate IS DISTINCT FROM OLD.default_commission_rate THEN
    -- Only allow the change if the user performing it is an admin/super_admin
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify commission rates.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_vendor_commission_update
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW
  EXECUTE PROCEDURE public.protect_vendor_commission_update();
