-- ==============================================================================
-- 🏗️ PHASE 4: VENDOR CATALOG & PRODUCT MANAGEMENT
-- ==============================================================================

-- 1. ENUMS
CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'archived');

-- 2. PRODUCTS TABLE
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  price NUMERIC NOT NULL CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  status public.product_status NOT NULL DEFAULT 'draft'::public.product_status,
  main_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, slug),
  UNIQUE (vendor_id, sku)
);

-- 3. INDEXES
CREATE INDEX idx_products_vendor_id ON public.products(vendor_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_slug ON public.products(slug);

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Buyers/Public can only see active products
CREATE POLICY "Public can view active products" ON public.products
  FOR SELECT USING (status = 'active');

-- Vendors and Vendor Staff can view all their own products (including drafts/archived)
CREATE POLICY "Vendor access can view own products" ON public.products
  FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));

-- Vendors and Vendor Staff can insert products for their own vendor
CREATE POLICY "Vendor access can insert products" ON public.products
  FOR INSERT WITH CHECK (public.has_vendor_access(vendor_id, auth.uid()));

-- Vendors and Vendor Staff can update their own products
CREATE POLICY "Vendor access can update products" ON public.products
  FOR UPDATE USING (public.has_vendor_access(vendor_id, auth.uid()))
  WITH CHECK (public.has_vendor_access(vendor_id, auth.uid()));

-- Admins and Super Admins have full access
CREATE POLICY "Admins have full product access" ON public.products
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Note: We intentionally OMIT a DELETE policy to enforce soft deletion.
-- Archiving is done via the UPDATE policy by setting status = 'archived'.


-- 5. TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();


-- 6. STORAGE BUCKETS & RLS
-- Create the products bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('products', 'products', true)
ON CONFLICT (id) DO NOTHING;

-- Public can read all product images
CREATE POLICY "Public Read Access Products" ON storage.objects
  FOR SELECT USING (bucket_id = 'products');

-- Vendors can upload/update/delete images ONLY in a folder matching their vendor_id.
-- (storage.foldername(name))[1] extracts the first part of the path, e.g., 'vendor-uuid/image.png' -> 'vendor-uuid'
CREATE POLICY "Vendors can manage their product images" ON storage.objects
  FOR ALL USING (
    bucket_id = 'products' AND
    public.has_vendor_access((storage.foldername(name))[1]::UUID, auth.uid())
  );
