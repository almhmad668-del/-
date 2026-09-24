-- ==============================================================================
-- 🏗️ PHASE 9: SHIPPING, TAX & ORDER FULFILLMENT FOUNDATION
-- ==============================================================================

-- 1. SHIPPING FOUNDATION
-- A minimal foundation to support future flat-rate / configurable shipping calculation.
CREATE TABLE public.shipping_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE CASCADE, -- NULL means global platform rule
  rule_type TEXT NOT NULL DEFAULT 'flat_rate',
  base_cost NUMERIC NOT NULL DEFAULT 0 CHECK (base_cost >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_shipping_rules_updated_at
  BEFORE UPDATE ON public.shipping_rules
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 2. TAX FOUNDATION
-- A minimal foundation for dynamic tax rate calculations
CREATE TABLE public.tax_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country TEXT, -- NULL means global fallback
  rate NUMERIC NOT NULL DEFAULT 0.0 CHECK (rate >= 0.0 AND rate <= 1.0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_tax_rules_updated_at
  BEFORE UPDATE ON public.tax_rules
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- Insert dummy default rules so calculations work out of the box
INSERT INTO public.tax_rules (country, rate) VALUES (NULL, 0.08); -- 8% global fallback tax
-- Insert a global flat-rate shipping rule of $5 just as a base fallback if a vendor has none
INSERT INTO public.shipping_rules (vendor_id, base_cost) VALUES (NULL, 5.00);

-- 3. UPDATING THE CHECKOUT RPC WITH TAX AND SHIPPING CALCULATION
-- Replace the Phase 8 `checkout_cart` RPC to inject dynamic tax and shipping queries
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
  v_master_shipping NUMERIC := 0;
  v_master_tax NUMERIC := 0;

  v_vendor_order_id UUID;

  v_variant_options_snapshot TEXT;
  v_unit_price NUMERIC;
  v_line_subtotal NUMERIC;

  v_vendor_shipping NUMERIC;
  v_tax_rate NUMERIC;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
     RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1. Validate Address
  SELECT * INTO v_address FROM public.customer_addresses WHERE id = p_address_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Address not found or unauthorized';
  END IF;

  -- Load Tax Rate based on Shipping Country (Fallback to global if not specific)
  SELECT rate INTO v_tax_rate FROM public.tax_rules
    WHERE (country = v_address.country OR country IS NULL) AND is_active = true
    ORDER BY country NULLS LAST LIMIT 1;

  IF v_tax_rate IS NULL THEN v_tax_rate := 0.0; END IF;

  -- 2. Find Cart and Lock it
  SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cart not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = v_cart_id) THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  -- 3. Pre-Validation pass
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

  -- 4. Create Master Order initially
  INSERT INTO public.orders (
    user_id, status, payment_status, currency,
    subtotal, shipping_total, tax_total, total,
    shipping_full_name, shipping_phone, shipping_country, shipping_city,
    shipping_district, shipping_address_line1, shipping_address_line2, shipping_postal_code
  ) VALUES (
    p_user_id, 'pending', 'pending', 'USD',
    0, 0, 0, 0,
    v_address.full_name, v_address.phone, v_address.country, v_address.city,
    v_address.district, v_address.address_line1, v_address.address_line2, v_address.postal_code
  ) RETURNING id INTO v_master_order_id;

  CREATE TEMP TABLE temp_vendor_totals (
    vendor_id UUID PRIMARY KEY,
    subtotal NUMERIC DEFAULT 0,
    shipping_total NUMERIC DEFAULT 0,
    vendor_order_id UUID
  ) ON COMMIT DROP;

  -- 5. Process Cart Items
  FOR v_item IN SELECT * FROM public.cart_items WHERE cart_id = v_cart_id LOOP

    SELECT * INTO v_product FROM public.products WHERE id = v_item.product_id;
    IF NOT FOUND OR v_product.status != 'active' THEN
      RAISE EXCEPTION 'Product % is not available', v_item.product_id;
    END IF;

    SELECT * INTO v_vendor FROM public.vendors WHERE id = v_product.vendor_id;
    IF NOT FOUND OR v_vendor.status != 'approved' THEN
      RAISE EXCEPTION 'Vendor is not approved';
    END IF;

    IF v_product.category_id IS NOT NULL THEN
      SELECT * INTO v_category FROM public.categories WHERE id = v_product.category_id;
      IF NOT FOUND OR v_category.is_active = false THEN
         RAISE EXCEPTION 'Product % is in an inactive category', v_item.product_id;
      END IF;
    END IF;

    IF v_item.variant_id IS NOT NULL THEN
      SELECT * INTO v_variant FROM public.product_variants WHERE id = v_item.variant_id;
      IF NOT FOUND OR v_variant.is_active = false OR v_variant.product_id != v_item.product_id THEN
        RAISE EXCEPTION 'Variant % is invalid or unavailable', v_item.variant_id;
      END IF;

      UPDATE public.product_variants
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.variant_id AND stock_quantity >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant stock ran out concurrently for %', v_item.variant_id;
      END IF;

      SELECT string_agg(pov.value, ' / ') INTO v_variant_options_snapshot
      FROM public.product_variant_values pvv
      JOIN public.product_option_values pov ON pvv.option_value_id = pov.id
      WHERE pvv.variant_id = v_item.variant_id;

      v_unit_price := COALESCE(v_variant.price, v_product.price);
    ELSE
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_item.quantity
      WHERE id = v_item.product_id AND stock_quantity >= v_item.quantity;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product stock ran out concurrently for %', v_item.product_id;
      END IF;

      v_variant_options_snapshot := NULL;
      v_unit_price := v_product.price;
    END IF;

    v_line_subtotal := v_unit_price * v_item.quantity;

    IF NOT EXISTS (SELECT 1 FROM temp_vendor_totals WHERE vendor_id = v_vendor.id) THEN
      -- Determine Shipping Cost for this vendor
      SELECT base_cost INTO v_vendor_shipping FROM public.shipping_rules
        WHERE (vendor_id = v_vendor.id OR vendor_id IS NULL) AND is_active = true
        ORDER BY vendor_id NULLS LAST LIMIT 1;

      IF v_vendor_shipping IS NULL THEN v_vendor_shipping := 0; END IF;

      INSERT INTO public.vendor_orders (order_id, vendor_id, subtotal, shipping_total, total)
      VALUES (v_master_order_id, v_vendor.id, 0, v_vendor_shipping, 0)
      RETURNING id INTO v_vendor_order_id;

      INSERT INTO temp_vendor_totals (vendor_id, subtotal, shipping_total, vendor_order_id)
      VALUES (v_vendor.id, v_line_subtotal, v_vendor_shipping, v_vendor_order_id);
    ELSE
      SELECT vendor_order_id INTO v_vendor_order_id FROM temp_vendor_totals WHERE vendor_id = v_vendor.id;
      UPDATE temp_vendor_totals SET subtotal = subtotal + v_line_subtotal WHERE vendor_id = v_vendor.id;
    END IF;

    INSERT INTO public.order_items (
      vendor_order_id, product_id, variant_id, quantity, unit_price, line_subtotal,
      product_name_snapshot, vendor_name_snapshot, variant_name_snapshot, sku_snapshot
    ) VALUES (
      v_vendor_order_id, v_item.product_id, v_item.variant_id, v_item.quantity, v_unit_price, v_line_subtotal,
      v_product.name, v_vendor.store_name, v_variant_options_snapshot, COALESCE(v_variant.sku, v_product.sku)
    );

    v_master_subtotal := v_master_subtotal + v_line_subtotal;
  END LOOP;

  -- 6. Finalize Totals with Shipping and Tax
  SELECT COALESCE(SUM(shipping_total), 0) INTO v_master_shipping FROM temp_vendor_totals;

  -- Simple tax model: (Subtotal + Shipping) * Tax Rate (Depends on business logic, here we tax both)
  v_master_tax := ROUND((v_master_subtotal + v_master_shipping) * v_tax_rate, 2);

  UPDATE public.vendor_orders vo
  SET
    subtotal = tvt.subtotal,
    -- Allocate tax proportionally to vendor_orders based on subtotal to maintain strict total integrity
    total = tvt.subtotal + tvt.shipping_total + ROUND((tvt.subtotal / NULLIF(v_master_subtotal, 0)) * v_master_tax, 2)
  FROM temp_vendor_totals tvt
  WHERE vo.id = tvt.vendor_order_id;

  UPDATE public.orders
  SET
    subtotal = v_master_subtotal,
    shipping_total = v_master_shipping,
    tax_total = v_master_tax,
    total = v_master_subtotal + v_master_shipping + v_master_tax
  WHERE id = v_master_order_id;

  -- 7. Clear Cart
  DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

  RETURN json_build_object(
    'code', 'SUCCESS',
    'order_id', v_master_order_id
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. ROW LEVEL SECURITY
ALTER TABLE public.shipping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active shipping rules" ON public.shipping_rules FOR SELECT USING (is_active = true);
CREATE POLICY "Public can view active tax rules" ON public.tax_rules FOR SELECT USING (is_active = true);

CREATE POLICY "Admins have full access to shipping rules" ON public.shipping_rules FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
CREATE POLICY "Admins have full access to tax rules" ON public.tax_rules FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

CREATE POLICY "Vendors can view and update their own shipping rules" ON public.shipping_rules
  FOR ALL USING (public.has_vendor_access(vendor_id, auth.uid()))
  WITH CHECK (public.has_vendor_access(vendor_id, auth.uid()));

CREATE POLICY "Vendors can update their own vendor orders" ON public.vendor_orders
  FOR UPDATE USING (public.has_vendor_access(vendor_id, auth.uid()))
  WITH CHECK (public.has_vendor_access(vendor_id, auth.uid()));
