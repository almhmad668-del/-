-- ==============================================================================
-- 🏗️ PHASE 3: VENDOR ONBOARDING & APPROVALS
-- ==============================================================================

-- 1. Create Vendor Status Enum
CREATE TYPE public.vendor_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');

-- 2. Alter Vendors Table
ALTER TABLE public.vendors
  ADD COLUMN slug TEXT UNIQUE,
  ADD COLUMN status public.vendor_status NOT NULL DEFAULT 'pending'::public.vendor_status;

-- Note: We already added INSERT policies for vendors in Phase 2:
-- CREATE POLICY "Users can insert vendors" ON public.vendors FOR INSERT WITH CHECK (auth.uid() = user_id);

-- We also need an INSERT policy for vendor_members so the onboarding flow can assign the owner.
-- The existing policy only allows existing vendor owners to manage members.
-- We must allow a user to insert themselves as an owner if they are the owner of the vendor.
DROP POLICY IF EXISTS "Users can insert themselves as owner" ON public.vendor_members;
CREATE POLICY "Users can insert themselves as owner" ON public.vendor_members
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    role = 'owner' AND
    EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_id AND user_id = auth.uid())
  );

-- Admin approval function to safely promote a buyer to a vendor
-- This is necessary because RLS protects the profiles.role column from normal users.
CREATE OR REPLACE FUNCTION public.approve_vendor(p_vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendor_owner_id UUID;
BEGIN
  -- Verify the caller is an admin or super_admin
  IF NOT public.is_admin_or_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: Only administrators can approve vendors.';
  END IF;

  -- Get the vendor's owner ID
  SELECT user_id INTO v_vendor_owner_id
  FROM public.vendors
  WHERE id = p_vendor_id;

  IF v_vendor_owner_id IS NULL THEN
    RAISE EXCEPTION 'Vendor not found.';
  END IF;

  -- 1. Update Vendor Status
  UPDATE public.vendors
  SET status = 'approved'::public.vendor_status
  WHERE id = p_vendor_id;

  -- 2. Update the Owner's Role in Profiles
  -- Bypassing the check_profile_role_update trigger because this function runs as SECURITY DEFINER
  -- (Wait, the trigger checks if the *caller* is an admin, which auth.uid() handles, so it's safe).
  UPDATE public.profiles
  SET role = 'vendor'::public.user_role
  WHERE id = v_vendor_owner_id;

  RETURN true;
END;
$$;

-- Protect 'status' column from non-admin updates to prevent approval bypass
CREATE OR REPLACE FUNCTION public.protect_vendor_status_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can change vendor approval status.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_vendor_status_update BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE PROCEDURE public.protect_vendor_status_update();
