-- ==============================================================================
-- 🏗️ PHASE 2: MULTI-VENDOR AUTHENTICATION, ROLES & RLS
-- ==============================================================================

-- ==============================================================================
-- TABLES
-- ==============================================================================

-- VENDORS
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENDOR MEMBERS (For vendor_staff role access)
CREATE TABLE public.vendor_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, user_id)
);

CREATE INDEX idx_vendor_members_user ON public.vendor_members(user_id);

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

-- Check if user owns the vendor or is an active staff member
CREATE OR REPLACE FUNCTION public.has_vendor_access(check_vendor_id UUID, check_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendors WHERE id = check_vendor_id AND user_id = check_user_id
    UNION ALL
    SELECT 1 FROM public.vendor_members WHERE vendor_id = check_vendor_id AND user_id = check_user_id AND is_active = true
  );
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_members ENABLE ROW LEVEL SECURITY;

-- VENDORS
CREATE POLICY "Public can view vendors" ON public.vendors FOR SELECT USING (true);
CREATE POLICY "Users can insert vendors" ON public.vendors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Only vendor owner can update vendor" ON public.vendors FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins have full vendor access" ON public.vendors FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- VENDOR MEMBERS
CREATE POLICY "Vendor access can view members" ON public.vendor_members FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Vendor owner can manage members" ON public.vendor_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.vendors WHERE id = vendor_id AND user_id = auth.uid())
);
CREATE POLICY "Admins have full member access" ON public.vendor_members FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
