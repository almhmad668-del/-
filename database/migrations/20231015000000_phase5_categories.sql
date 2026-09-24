-- ==============================================================================
-- 🏗️ PHASE 5: CATEGORIES & PUBLIC CATALOG
-- ==============================================================================

-- 1. CATEGORIES TABLE
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  parent_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_slug ON public.categories(slug);
CREATE INDEX idx_categories_is_active ON public.categories(is_active);
CREATE INDEX idx_categories_parent_id ON public.categories(parent_id);

-- 2. ALTER PRODUCTS
ALTER TABLE public.products
  ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;

CREATE INDEX idx_products_category_id ON public.products(category_id);

-- 3. TRIGGER FOR UPDATED_AT ON CATEGORIES
CREATE TRIGGER set_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 4. ROW LEVEL SECURITY (CATEGORIES)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active categories" ON public.categories
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins have full category access" ON public.categories
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- 5. UPDATE PUBLIC PRODUCT VISIBILITY RULES
-- The public catalog may expose a product ONLY when:
-- 1. products.status = 'active'
-- 2. Owning vendor has vendors.status = 'approved'
-- We must replace the existing weak policy from Phase 4.

DROP POLICY IF EXISTS "Public can view active products" ON public.products;

CREATE POLICY "Public can view active products of approved vendors" ON public.products
  FOR SELECT USING (
    status = 'active' AND
    EXISTS (SELECT 1 FROM public.vendors WHERE id = public.products.vendor_id AND status = 'approved')
  );

-- Note: We don't strictly enforce category.is_active = true inside the product RLS itself
-- because products without categories (legacy phase 4) or products accessed directly
-- might still be visible, but the application layer / storefront MUST enforce category
-- activity when browsing by category.
