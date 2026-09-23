-- ==============================================================================
-- 🏗️ PHASE 8: CHECKOUT & ORDERS
-- ==============================================================================

-- 1. ENUMS FOR STATUS
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'processing', 'completed', 'cancelled');
CREATE TYPE public.vendor_order_status AS ENUM ('pending', 'processing', 'shipped', 'delivered', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- 2. MASTER ORDERS TABLE
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.order_status NOT NULL DEFAULT 'pending',
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  shipping_total NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  tax_total NUMERIC NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  discount_total NUMERIC NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total NUMERIC NOT NULL CHECK (total >= 0),

  -- Shipping Address Snapshot
  shipping_full_name TEXT NOT NULL,
  shipping_phone TEXT NOT NULL,
  shipping_country TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_district TEXT,
  shipping_address_line1 TEXT NOT NULL,
  shipping_address_line2 TEXT,
  shipping_postal_code TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 3. VENDOR ORDERS TABLE
CREATE TABLE public.vendor_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  status public.vendor_order_status NOT NULL DEFAULT 'pending',
  subtotal NUMERIC NOT NULL CHECK (subtotal >= 0),
  shipping_total NUMERIC NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  discount_total NUMERIC NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  total NUMERIC NOT NULL CHECK (total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce 1 Vendor Order per Vendor per Master Order
  UNIQUE(order_id, vendor_id)
);

CREATE INDEX idx_vendor_orders_order_id ON public.vendor_orders(order_id);
CREATE INDEX idx_vendor_orders_vendor_id ON public.vendor_orders(vendor_id);
CREATE INDEX idx_vendor_orders_status ON public.vendor_orders(status);

CREATE TRIGGER set_vendor_orders_updated_at
  BEFORE UPDATE ON public.vendor_orders
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();


-- 4. ORDER ITEMS TABLE
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_order_id UUID NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 1),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  line_subtotal NUMERIC NOT NULL CHECK (line_subtotal >= 0),

  -- Historical Snapshots
  product_name_snapshot TEXT NOT NULL,
  vendor_name_snapshot TEXT NOT NULL,
  variant_name_snapshot TEXT,
  sku_snapshot TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_vendor_order_id ON public.order_items(vendor_order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX idx_order_items_variant_id ON public.order_items(variant_id);

CREATE TRIGGER set_order_items_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 5. ATOMIC CHECKOUT RPC
-- This RPC executes the entire checkout process atomically.
-- It verifies cart items, decrements stock, calculates totals, creates orders, and clears the cart.
-- If stock is insufficient, it rolls back and returns the structured error payload.

CREATE OR REPLACE FUNCTION public.checkout_cart(p_user_id UUID, p_address_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cart_id UUID;
  v_address RECORD;
  v_item RECORD;
  v_stock INT;
  v_product RECORD;
  v_variant RECORD;
  v_vendor RECORD;
  v_category RECORD;

  v_master_order_id UUID;
  v_master_subtotal NUMERIC := 0;
  v_vendor_order_id UUID;

  v_variant_options_snapshot TEXT;
  v_unit_price NUMERIC;
  v_line_subtotal NUMERIC;

BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
     RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1. Validate Address
  SELECT * INTO v_address FROM public.customer_addresses WHERE id = p_address_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address not found or unauthorized';
  END IF;

  -- 2. Find Cart and Lock it to prevent duplicate checkout races
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  -- Verify Cart is not empty
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- 3. Create Master Order (Initially with 0 totals, will update at the end)
  INSERT INTO public.orders (
    user_id, status, payment_status, currency,
    subtotal, total,
    shipping_full_name, shipping_phone, shipping_country, shipping_city,
    shipping_district, shipping_address_line1, shipping_address_line2, shipping_postal_code
  ) VALUES (
    p_user_id, 'pending', 'pending', 'USD',
    0, 0,
    v_address.full_name, v_address.phone, v_address.country, v_address.city,
    v_address.district, v_address.address_line1, v_address.address_line2, v_address.postal_code
  ) RETURNING id INTO v_master_order_id;

  -- Create a temporary table to track vendor subtotals
  CREATE TEMP TABLE temp_vendor_totals (
    vendor_id UUID PRIMARY KEY,
    subtotal NUMERIC DEFAULT 0,
    vendor_order_id UUID
  ) ON COMMIT DROP;

  -- 4. Pre-Validation pass: Check all stock BEFORE mutating anything to avoid partial commits on RETURN.
  FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart_id LOOP
    IF v_item.variant_id IS NOT NULL THEN
      SELECT stock_quantity INTO v_stock FROM public.product_variants WHERE id = v_item.variant_id;
      IF v_stock < v_item.quantity THEN
         RETURN json_build_object('code', 'INSUFFICIENT_STOCK', 'product_id', v_item.product_id, 'variant_id', v_item.variant_id, 'message', 'Insufficient stock for requested variant.');
      END IF;
    ELSE
      SELECT stock_quantity INTO v_stock FROM public.products WHERE id = v_item.product_id;
      IF v_stock < v_item.quantity THEN
         RETURN json_build_object('code', 'INSUFFICIENT_STOCK', 'product_id', v_item.product_id, 'message', 'Insufficient stock for requested product.');
      END IF;
    END IF;
  END LOOP;

  -- 5. Create Master Order (Initially with 0 totals, will update at the end)
  INSERT INTO public.orders (
    user_id, status, payment_status, currency,
    subtotal, total,
    shipping_full_name, shipping_phone, shipping_country, shipping_city,
    shipping_district, shipping_address_line1, shipping_address_line2, shipping_postal_code
  ) VALUES (
    p_user_id, 'pending', 'pending', 'USD',
    0, 0,
    v_address.full_name, v_address.phone, v_address.country, v_address.city,
    v_address.district, v_address.address_line1, v_address.address_line2, v_address.postal_code
  ) RETURNING id INTO v_master_order_id;

  -- Create a temporary table to track vendor subtotals
  CREATE TEMP TABLE temp_vendor_totals (
    vendor_id UUID PRIMARY KEY,
    subtotal NUMERIC DEFAULT 0,
    vendor_order_id UUID
  ) ON COMMIT DROP;

  -- 6. Process Cart Items atomically
  FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart_id LOOP

    -- Load Product
    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    IF NOT FOUND OR v_product.status != 'active' THEN
      RAISE EXCEPTION 'Product % is not available', v_item.product_id;
    END IF;

    -- Load Vendor
    SELECT * INTO v_vendor FROM public.vendors WHERE id = v_product.vendor_id;
    IF NOT FOUND OR v_vendor.status != 'approved' THEN
      RAISE EXCEPTION 'Vendor is not approved';
    END IF;

    -- Load Category
    IF v_product.category_id IS NOT NULL THEN
      SELECT * INTO v_category FROM public.categories WHERE id = v_product.category_id;
      IF NOT FOUND OR v_category.is_active = false THEN
         RAISE EXCEPTION 'Product % is in an inactive category', v_item.product_id;
      END IF;
    END IF;

    -- Variant logic vs Base Product logic
    IF v_item.variant_id IS NOT NULL THEN
      SELECT * INTO v_variant FROM public.product_variants WHERE id = v_item.variant_id;
      IF NOT FOUND OR v_variant.is_active = false OR v_variant.product_id != v_item.product_id THEN
        RAISE EXCEPTION 'Variant % is invalid or unavailable', v_item.variant_id;
      END IF;

      -- Stock Decrement Variant
      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id AND stock_quantity >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant stock ran out concurrently for %', v_item.variant_id;
      END IF;

      -- Build snapshot string for options
      SELECT string_agg(pov.value, ' / ') INTO v_variant_options_snapshot
      FROM public.product_variant_values pvv
      JOIN public.product_option_values pov ON pvv.option_value_id = pov.id
      WHERE pvv.variant_id = v_item.variant_id;

      v_unit_price := COALESCE(v_variant.price, v_product.price);

    ELSE
      -- Stock Decrement Product
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.product_id AND stock_quantity >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product stock ran out concurrently for %', v_item.product_id;
      END IF;

      v_variant_options_snapshot := NULL;
      v_unit_price := v_product.price;
    END IF;

    -- Compute Line Total
    v_line_subtotal := v_unit_price * v_item.quantity;

    -- Ensure Vendor Order exists
    IF NOT EXISTS (SELECT 1 FROM temp_vendor_totals WHERE vendor_id = v_vendor.id) THEN
      INSERT INTO public.vendor_orders (order_id, vendor_id, subtotal, total)
      VALUES (v_master_order_id, v_vendor.id, 0, 0)
      RETURNING id INTO v_vendor_order_id;

      INSERT INTO temp_vendor_totals (vendor_id, subtotal, vendor_order_id)
      VALUES (v_vendor.id, v_line_subtotal, v_vendor_order_id);
    ELSE
      SELECT vendor_order_id INTO v_vendor_order_id FROM temp_vendor_totals WHERE vendor_id = v_vendor.id;
      UPDATE temp_vendor_totals SET subtotal = subtotal + v_line_subtotal WHERE vendor_id = v_vendor.id;
    END IF;

    -- Insert Order Item
    INSERT INTO public.order_items (
      vendor_order_id, product_id, variant_id, quantity, unit_price, line_subtotal,
      product_name_snapshot, vendor_name_snapshot, variant_name_snapshot, sku_snapshot
    ) VALUES (
      v_vendor_order_id, v_item.product_id, v_item.variant_id, v_item.quantity, v_unit_price, v_line_subtotal,
      v_product.name, v_vendor.store_name, v_variant_options_snapshot, COALESCE(v_variant.sku, v_product.sku)
    );

    v_master_subtotal := v_master_subtotal + v_line_subtotal;

  END LOOP;

  -- 5. Finalize Subtotals
  UPDATE public.vendor_orders vo
  SET subtotal = tvt.subtotal, total = tvt.subtotal
  FROM temp_vendor_totals tvt
  WHERE vo.id = tvt.vendor_order_id;

  UPDATE public.orders
  SET subtotal = v_master_subtotal, total = v_master_subtotal
  WHERE id = v_master_order_id;

  -- 6. Clear Cart
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN json_build_object(
    'code', 'SUCCESS',
    'order_id', v_master_order_id
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. ROW LEVEL SECURITY (RLS)

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Master Orders
CREATE POLICY "Buyers can read their own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins have full access orders" ON public.orders
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Vendor Orders (Buyers read via Master Order, Vendors read via membership)
CREATE POLICY "Buyers can read their own vendor orders" ON public.vendor_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

CREATE POLICY "Vendors can read their own vendor orders" ON public.vendor_orders
  FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));

CREATE POLICY "Admins have full access vendor orders" ON public.vendor_orders
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Order Items
CREATE POLICY "Buyers can read their own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vendor_orders vo
      JOIN public.orders o ON o.id = vo.order_id
      WHERE vo.id = vendor_order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Vendors can read their own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.vendor_orders vo
      WHERE vo.id = vendor_order_id AND public.has_vendor_access(vo.vendor_id, auth.uid())
    )
  );

CREATE POLICY "Admins have full access order items" ON public.order_items
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
