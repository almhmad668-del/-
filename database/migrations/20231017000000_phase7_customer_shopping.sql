-- ==============================================================================
-- 🏗️ PHASE 7: CUSTOMER SHOPPING
-- ==============================================================================

-- 1. CARTS TABLE
CREATE TABLE public.carts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce exactly one active/persistent cart per user
CREATE UNIQUE INDEX idx_carts_unique_user ON public.carts(user_id);

CREATE TRIGGER set_carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 2. CART ITEMS TABLE
CREATE TABLE public.cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- Enforce duplicate item prevention using partial unique indexes
CREATE UNIQUE INDEX idx_cart_items_unique_variant
  ON public.cart_items(cart_id, product_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX idx_cart_items_unique_product
  ON public.cart_items(cart_id, product_id)
  WHERE variant_id IS NULL;

-- Enforce Variant-to-Product relationship integrity
CREATE OR REPLACE FUNCTION public.check_cart_item_variant_integrity()
RETURNS TRIGGER AS $$
DECLARE
  v_variant_product_id UUID;
BEGIN
  IF NEW.variant_id IS NOT NULL THEN
    SELECT product_id INTO v_variant_product_id FROM public.product_variants WHERE id = NEW.variant_id;
    IF v_variant_product_id != NEW.product_id THEN
      RAISE EXCEPTION 'Variant does not belong to the specified product.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_cart_item_variant_integrity
  BEFORE INSERT OR UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE PROCEDURE public.check_cart_item_variant_integrity();

-- 3. WISHLISTS TABLE
CREATE TABLE public.wishlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce exactly one primary wishlist per user
CREATE UNIQUE INDEX idx_wishlists_unique_user ON public.wishlists(user_id);

CREATE TRIGGER set_wishlists_updated_at
  BEFORE UPDATE ON public.wishlists
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 4. WISHLIST ITEMS TABLE
CREATE TABLE public.wishlist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wishlist_id UUID NOT NULL REFERENCES public.wishlists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wishlist_id, product_id)
);

-- 5. CUSTOMER ADDRESSES TABLE
CREATE TABLE public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  postal_code TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce maximum of ONE default address per user
CREATE UNIQUE INDEX only_one_default_address
  ON public.customer_addresses (user_id)
  WHERE is_default = true;

CREATE TRIGGER set_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- Function to safely change default address
CREATE OR REPLACE FUNCTION public.set_default_address(p_user_id UUID, p_address_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
     RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Unset existing defaults
  UPDATE public.customer_addresses
  SET is_default = false
  WHERE user_id = p_user_id AND is_default = true AND id != p_address_id;

  -- Set new default
  UPDATE public.customer_addresses
  SET is_default = true
  WHERE user_id = p_user_id AND id = p_address_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ROW LEVEL SECURITY (RLS)

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Carts
CREATE POLICY "Users can manage own cart" ON public.carts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins have full access carts" ON public.carts
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Cart Items
CREATE POLICY "Users can manage own cart items" ON public.cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.carts c WHERE c.id = cart_id AND c.user_id = auth.uid())
  );

CREATE POLICY "Admins have full access cart_items" ON public.cart_items
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Wishlists
CREATE POLICY "Users can manage own wishlist" ON public.wishlists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins have full access wishlists" ON public.wishlists
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Wishlist Items
CREATE POLICY "Users can manage own wishlist items" ON public.wishlist_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.wishlists w WHERE w.id = wishlist_id AND w.user_id = auth.uid())
  );

CREATE POLICY "Admins have full access wishlist_items" ON public.wishlist_items
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Customer Addresses
CREATE POLICY "Users can manage own addresses" ON public.customer_addresses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins have full access customer_addresses" ON public.customer_addresses
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
