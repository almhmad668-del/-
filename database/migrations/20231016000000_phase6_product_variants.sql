-- ==============================================================================
-- 🏗️ PHASE 6: PRODUCT VARIANTS & DETAILS
-- ==============================================================================

-- 1. ADD PUBLIC SLUG TO PRODUCTS
ALTER TABLE public.products ADD COLUMN public_slug TEXT;

-- Generate public_slug for existing rows to avoid NOT NULL violations if any exist
UPDATE public.products SET public_slug = id::text || '-' || slug WHERE public_slug IS NULL;

ALTER TABLE public.products ALTER COLUMN public_slug SET NOT NULL;
CREATE UNIQUE INDEX idx_products_public_slug ON public.products(public_slug);

-- 2. PRODUCT OPTIONS TABLE
CREATE TABLE public.product_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, name)
);

CREATE INDEX idx_product_options_product_id ON public.product_options(product_id);

CREATE TRIGGER set_product_options_updated_at
  BEFORE UPDATE ON public.product_options
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 3. PRODUCT OPTION VALUES TABLE
CREATE TABLE public.product_option_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  option_id UUID NOT NULL REFERENCES public.product_options(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(option_id, value)
);

CREATE INDEX idx_product_option_values_option_id ON public.product_option_values(option_id);

CREATE TRIGGER set_product_option_values_updated_at
  BEFORE UPDATE ON public.product_option_values
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 4. PRODUCT VARIANTS TABLE
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT,
  sku TEXT,
  price NUMERIC CHECK (price IS NULL OR price >= 0),
  compare_at_price NUMERIC CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  canonical_combination_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(product_id, sku),
  UNIQUE(product_id, canonical_combination_key)
);

CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX idx_product_variants_is_active ON public.product_variants(is_active);

CREATE TRIGGER set_product_variants_updated_at
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- Enforce product_id immutability
CREATE OR REPLACE FUNCTION public.check_product_id_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.product_id != OLD.product_id THEN
    RAISE EXCEPTION 'product_id is immutable and cannot be changed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_variant_product_id_immutability
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE PROCEDURE public.check_product_id_immutability();

CREATE TRIGGER enforce_option_product_id_immutability
  BEFORE UPDATE ON public.product_options
  FOR EACH ROW EXECUTE PROCEDURE public.check_product_id_immutability();

-- 5. PRODUCT VARIANT VALUES TABLE
CREATE TABLE public.product_variant_values (
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES public.product_option_values(id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

-- Enforce Ownership Chain & Same-Option Duplication Prevention
CREATE OR REPLACE FUNCTION public.check_variant_value_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_variant_product_id UUID;
  v_option_product_id UUID;
  v_option_id UUID;
  v_duplicate_count INT;
BEGIN
  -- Check Ownership Chain
  SELECT product_id INTO v_variant_product_id FROM public.product_variants WHERE id = NEW.variant_id;

  SELECT po.product_id, po.id INTO v_option_product_id, v_option_id
  FROM public.product_option_values pov
  JOIN public.product_options po ON po.id = pov.option_id
  WHERE pov.id = NEW.option_value_id;

  IF v_variant_product_id != v_option_product_id THEN
    RAISE EXCEPTION 'Variant and Option Value must belong to the same product.';
  END IF;

  -- Check Same-Option Duplication
  SELECT COUNT(*) INTO v_duplicate_count
  FROM public.product_variant_values pvv
  JOIN public.product_option_values pov ON pvv.option_value_id = pov.id
  WHERE pvv.variant_id = NEW.variant_id AND pov.option_id = v_option_id;

  IF v_duplicate_count > 0 THEN
    RAISE EXCEPTION 'Variant cannot have multiple values for the same option.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_variant_value_integrity
  BEFORE INSERT OR UPDATE ON public.product_variant_values
  FOR EACH ROW EXECUTE PROCEDURE public.check_variant_value_integrity();

-- 6. ROW LEVEL SECURITY (RLS)

ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variant_values ENABLE ROW LEVEL SECURITY;

-- Helper to check if product is publicly visible
CREATE OR REPLACE FUNCTION public.is_product_publicly_visible(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_visible BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.products p
    JOIN public.vendors v ON p.vendor_id = v.id
    WHERE p.id = p_product_id
      AND p.status = 'active'
      AND v.status = 'approved'
  ) INTO v_is_visible;
  RETURN v_is_visible;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Public read policies
CREATE POLICY "Public can view options of active products" ON public.product_options
  FOR SELECT USING (public.is_product_publicly_visible(product_id));

CREATE POLICY "Public can view option values of active products" ON public.product_option_values
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.product_options WHERE id = option_id AND public.is_product_publicly_visible(product_id))
  );

CREATE POLICY "Public can view active variants of active products" ON public.product_variants
  FOR SELECT USING (is_active = true AND public.is_product_publicly_visible(product_id));

CREATE POLICY "Public can view variant values of active variants" ON public.product_variant_values
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.product_variants WHERE id = variant_id AND is_active = true AND public.is_product_publicly_visible(product_id))
  );

-- Helper to check if user has access to manage a product
CREATE OR REPLACE FUNCTION public.has_product_management_access(p_product_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id
      AND public.has_vendor_access(p.vendor_id, p_user_id)
  ) INTO v_has_access;
  RETURN v_has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Vendor management policies (product_options)
CREATE POLICY "Vendor access can view own options" ON public.product_options
  FOR SELECT USING (public.has_product_management_access(product_id, auth.uid()));

CREATE POLICY "Vendor access can insert options" ON public.product_options
  FOR INSERT WITH CHECK (public.has_product_management_access(product_id, auth.uid()));

CREATE POLICY "Vendor access can update options" ON public.product_options
  FOR UPDATE USING (public.has_product_management_access(product_id, auth.uid()))
  WITH CHECK (public.has_product_management_access(product_id, auth.uid()));

CREATE POLICY "Vendor access can delete options" ON public.product_options
  FOR DELETE USING (public.has_product_management_access(product_id, auth.uid()));

-- Vendor management policies (product_option_values)
CREATE POLICY "Vendor access can view own option values" ON public.product_option_values
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.product_options po WHERE po.id = option_id AND public.has_product_management_access(po.product_id, auth.uid()))
  );

CREATE POLICY "Vendor access can insert option values" ON public.product_option_values
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.product_options po WHERE po.id = option_id AND public.has_product_management_access(po.product_id, auth.uid()))
  );

CREATE POLICY "Vendor access can update option values" ON public.product_option_values
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.product_options po WHERE po.id = option_id AND public.has_product_management_access(po.product_id, auth.uid()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.product_options po WHERE po.id = option_id AND public.has_product_management_access(po.product_id, auth.uid()))
  );

CREATE POLICY "Vendor access can delete option values" ON public.product_option_values
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.product_options po WHERE po.id = option_id AND public.has_product_management_access(po.product_id, auth.uid()))
  );

-- Vendor management policies (product_variants)
CREATE POLICY "Vendor access can view own variants" ON public.product_variants
  FOR SELECT USING (public.has_product_management_access(product_id, auth.uid()));

CREATE POLICY "Vendor access can insert variants" ON public.product_variants
  FOR INSERT WITH CHECK (public.has_product_management_access(product_id, auth.uid()));

CREATE POLICY "Vendor access can update variants" ON public.product_variants
  FOR UPDATE USING (public.has_product_management_access(product_id, auth.uid()))
  WITH CHECK (public.has_product_management_access(product_id, auth.uid()));

-- Vendor management policies (product_variant_values)
CREATE POLICY "Vendor access can view own variant values" ON public.product_variant_values
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.id = variant_id AND public.has_product_management_access(pv.product_id, auth.uid()))
  );

CREATE POLICY "Vendor access can insert variant values" ON public.product_variant_values
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.id = variant_id AND public.has_product_management_access(pv.product_id, auth.uid()))
  );

CREATE POLICY "Vendor access can delete variant values" ON public.product_variant_values
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.id = variant_id AND public.has_product_management_access(pv.product_id, auth.uid()))
  );

-- Admin full access
CREATE POLICY "Admins have full access options" ON public.product_options FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
CREATE POLICY "Admins have full access option_values" ON public.product_option_values FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
CREATE POLICY "Admins have full access variants" ON public.product_variants FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
CREATE POLICY "Admins have full access variant_values" ON public.product_variant_values FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
