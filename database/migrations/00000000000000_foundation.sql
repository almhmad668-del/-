-- ==============================================================================
-- 🏗️ MULTI-VENDOR MARKETPLACE FOUNDATION SCHEMA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- ENUMS
-- ==============================================================================
CREATE TYPE public.user_role AS ENUM ('buyer', 'vendor', 'vendor_staff', 'admin', 'super_admin');
CREATE TYPE public.order_status AS ENUM ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded');
CREATE TYPE public.transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE public.ledger_status AS ENUM ('pending', 'completed', 'failed');

-- ==============================================================================
-- TABLES
-- ==============================================================================

-- PROFILES
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'buyer'::public.user_role,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENDORS
CREATE TABLE public.vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_name TEXT NOT NULL,
  default_commission_rate NUMERIC NOT NULL CHECK (default_commission_rate >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENDOR MEMBERS (For vendor_staff role access)
CREATE TABLE public.vendor_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(vendor_id, user_id)
);

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  is_cod_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDERS
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  status public.order_status NOT NULL DEFAULT 'pending'::public.order_status,
  payment_method TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- VENDOR ORDERS
CREATE TABLE public.vendor_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  commission_rate_snapshot NUMERIC NOT NULL,
  subtotal_amount NUMERIC NOT NULL CHECK (subtotal_amount >= 0),
  commission_amount NUMERIC NOT NULL CHECK (commission_amount >= 0),
  status public.order_status NOT NULL DEFAULT 'pending'::public.order_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ORDER ITEMS
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_order_id UUID NOT NULL REFERENCES public.vendor_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_at_purchase NUMERIC NOT NULL CHECK (price_at_purchase >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- LEDGER ENTRIES
CREATE TABLE public.ledger_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  type public.transaction_type NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status public.ledger_status NOT NULL DEFAULT 'pending'::public.ledger_status,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PROCESSED WEBHOOKS
CREATE TABLE public.processed_webhooks (
  event_id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- INDEXES
-- ==============================================================================
CREATE INDEX idx_vendors_user_id ON public.vendors(user_id);
CREATE INDEX idx_vendor_members_user ON public.vendor_members(user_id);
CREATE INDEX idx_products_vendor_id ON public.products(vendor_id);
CREATE INDEX idx_products_stock_quantity ON public.products(stock_quantity);
CREATE INDEX idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_vendor_orders_order_id ON public.vendor_orders(order_id);
CREATE INDEX idx_vendor_orders_vendor_id ON public.vendor_orders(vendor_id);
CREATE INDEX idx_order_items_vendor_order_id ON public.order_items(vendor_order_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);
CREATE INDEX idx_ledger_entries_vendor_id ON public.ledger_entries(vendor_id);

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

-- Check if user owns the vendor or is a staff member
CREATE OR REPLACE FUNCTION public.has_vendor_access(check_vendor_id UUID, check_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vendors WHERE id = check_vendor_id AND user_id = check_user_id
    UNION ALL
    SELECT 1 FROM public.vendor_members WHERE vendor_id = check_vendor_id AND user_id = check_user_id
  );
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ==============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.is_admin_or_super_admin(auth.uid()));

-- VENDORS
CREATE POLICY "Public can view vendors" ON public.vendors FOR SELECT USING (true);
CREATE POLICY "Vendor access can update vendor" ON public.vendors FOR UPDATE USING (public.has_vendor_access(id, auth.uid()));
CREATE POLICY "Admins have full vendor access" ON public.vendors FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- VENDOR MEMBERS
CREATE POLICY "Vendor access can view members" ON public.vendor_members FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Admins have full member access" ON public.vendor_members FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- PRODUCTS
CREATE POLICY "Public can view products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Vendor access can insert products" ON public.products FOR INSERT WITH CHECK (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Vendor access can update products" ON public.products FOR UPDATE USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Vendor access can delete products" ON public.products FOR DELETE USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Admins have full product access" ON public.products FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- ORDERS (Buyers and Admins)
CREATE POLICY "Buyers can view their orders" ON public.orders FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.is_admin_or_super_admin(auth.uid()));

-- VENDOR ORDERS
CREATE POLICY "Buyers can view their vendor orders" ON public.vendor_orders FOR SELECT USING (order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid()));
CREATE POLICY "Vendor access can view vendor orders" ON public.vendor_orders FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Admins can view all vendor orders" ON public.vendor_orders FOR SELECT USING (public.is_admin_or_super_admin(auth.uid()));

-- ORDER ITEMS
CREATE POLICY "Buyers can view their order items" ON public.order_items FOR SELECT USING (
  vendor_order_id IN (SELECT vo.id FROM public.vendor_orders vo JOIN public.orders o ON vo.order_id = o.id WHERE o.customer_id = auth.uid())
);
CREATE POLICY "Vendor access can view order items" ON public.order_items FOR SELECT USING (
  vendor_order_id IN (SELECT id FROM public.vendor_orders WHERE public.has_vendor_access(vendor_id, auth.uid()))
);
CREATE POLICY "Admins can view all order items" ON public.order_items FOR SELECT USING (public.is_admin_or_super_admin(auth.uid()));

-- LEDGER ENTRIES
CREATE POLICY "Vendor access can view ledger" ON public.ledger_entries FOR SELECT USING (public.has_vendor_access(vendor_id, auth.uid()));
CREATE POLICY "Admins can view all ledgers" ON public.ledger_entries FOR SELECT USING (public.is_admin_or_super_admin(auth.uid()));

-- PROCESSED WEBHOOKS
-- No public policies. Only service_role can access.


-- ==============================================================================
-- TRIGGERS & SECURITY COLUMN PROTECTION
-- ==============================================================================

-- Auto-create profile on Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, phone, role)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.phone, new.raw_user_meta_data->>'phone'),
    'buyer'::public.user_role
  );
  RETURN new;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Protect 'role' column from non-admin updates
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can change roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_profile_role_update BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.protect_profile_role_update();

-- Protect 'default_commission_rate' column from non-admin updates
CREATE OR REPLACE FUNCTION public.protect_vendor_commission_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.default_commission_rate IS DISTINCT FROM OLD.default_commission_rate THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Unauthorized: Only administrators can modify commission rates.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER check_vendor_commission_update BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE PROCEDURE public.protect_vendor_commission_update();


-- ==============================================================================
-- CHECKOUT & PAYMENT ENGINE (PL/pgSQL RPCs)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.process_marketplace_checkout(order_payload JSONB)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_payment_method TEXT;
  v_item JSONB;
  v_product_id UUID;
  v_req_quantity INT;
  v_product RECORD;
  v_vendor RECORD;
  v_grand_total NUMERIC := 0;
  v_main_order_id UUID;
  v_vendor_id UUID;
  v_vendor_subtotal NUMERIC;
  v_vendor_commission NUMERIC;
  v_vendor_order_id UUID;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Unauthorized: User must be logged in to checkout'; END IF;
  IF order_payload->>'customer_id' IS NOT NULL AND (order_payload->>'customer_id')::UUID != v_customer_id THEN
     RAISE EXCEPTION 'Unauthorized: Cannot checkout for another user';
  END IF;

  v_payment_method := order_payload->>'payment_method';
  IF v_payment_method IS NULL OR trim(v_payment_method) = '' THEN RAISE EXCEPTION 'payment_method is required'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS temp_cart_items (
    product_id UUID, vendor_id UUID, quantity INT, price NUMERIC, line_total NUMERIC
  ) ON COMMIT DELETE ROWS;
  TRUNCATE temp_cart_items;

  -- Lock & Deduct Inventory (Pessimistic)
  FOR v_item IN SELECT * FROM jsonb_array_elements(order_payload->'items') ORDER BY (value->>'product_id')::UUID
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_req_quantity := (v_item->>'quantity')::INT;
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'Product ID is missing in payload item'; END IF;
    IF v_req_quantity IS NULL OR v_req_quantity <= 0 THEN RAISE EXCEPTION 'Quantity for product % must be greater than 0', v_product_id; END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product % does not exist', v_product_id; END IF;
    IF v_product.stock_quantity < v_req_quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product.title; END IF;
    IF v_payment_method = 'cod' AND v_product.is_cod_enabled = false THEN RAISE EXCEPTION 'Product % does not support COD', v_product.title; END IF;

    UPDATE public.products SET stock_quantity = stock_quantity - v_req_quantity WHERE id = v_product_id;
    INSERT INTO temp_cart_items (product_id, vendor_id, quantity, price, line_total)
    VALUES (v_product_id, v_product.vendor_id, v_req_quantity, v_product.price, v_product.price * v_req_quantity);

    v_grand_total := v_grand_total + (v_product.price * v_req_quantity);
  END LOOP;

  -- Create Orders
  INSERT INTO public.orders (customer_id, total_amount, status, payment_method) VALUES (v_customer_id, v_grand_total, 'pending', v_payment_method) RETURNING id INTO v_main_order_id;

  FOR v_vendor_id IN SELECT DISTINCT vendor_id FROM temp_cart_items LOOP
    SELECT * INTO v_vendor FROM public.vendors WHERE id = v_vendor_id;
    SELECT COALESCE(SUM(line_total), 0) INTO v_vendor_subtotal FROM temp_cart_items WHERE vendor_id = v_vendor_id;
    v_vendor_commission := v_vendor_subtotal * (v_vendor.default_commission_rate / 100.0);

    INSERT INTO public.vendor_orders (order_id, vendor_id, commission_rate_snapshot, subtotal_amount, commission_amount, status)
    VALUES (v_main_order_id, v_vendor_id, v_vendor.default_commission_rate, v_vendor_subtotal, v_vendor_commission, 'pending') RETURNING id INTO v_vendor_order_id;

    INSERT INTO public.order_items (vendor_order_id, product_id, quantity, price_at_purchase)
    SELECT v_vendor_order_id, product_id, quantity, price FROM temp_cart_items WHERE vendor_id = v_vendor_id;

    INSERT INTO public.ledger_entries (vendor_id, type, amount, reference_id, status)
    VALUES (v_vendor_id, 'credit', v_vendor_subtotal - v_vendor_commission, v_vendor_order_id, 'pending');
  END LOOP;

  RETURN json_build_object('order_id', v_main_order_id, 'total_amount', v_grand_total);
END;
$$;

-- Secure Webhook Handler
CREATE OR REPLACE FUNCTION public.finalize_payment(p_order_id UUID, p_event_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  BEGIN
    INSERT INTO public.processed_webhooks (event_id) VALUES (p_event_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN json_build_object('success', false, 'message', 'Webhook already processed.', 'already_processed', true);
  END;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status IN ('paid', 'cancelled', 'refunded') THEN RETURN json_build_object('success', false, 'message', 'Order in final state.', 'already_processed', true); END IF;

  UPDATE public.orders SET status = 'paid'::public.order_status WHERE id = p_order_id;
  UPDATE public.vendor_orders SET status = 'paid'::public.order_status WHERE order_id = p_order_id;
  UPDATE public.ledger_entries SET status = 'completed'::public.ledger_status WHERE reference_id IN (SELECT id FROM public.vendor_orders WHERE order_id = p_order_id);

  RETURN json_build_object('success', true, 'message', 'Payment finalized successfully.');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment(UUID, TEXT) TO service_role;


-- ==============================================================================
-- VIEWS & CRON (Tasks 5.2, 5.3)
-- ==============================================================================

-- Feed View
CREATE OR REPLACE VIEW public.marketplace_feed_view AS
SELECT p.id AS product_id, p.title, p.price, p.is_cod_enabled, p.stock_quantity, v.store_name
FROM public.products p JOIN public.vendors v ON p.vendor_id = v.id WHERE p.stock_quantity > 0;

-- Auto-cancel abandoned orders
CREATE OR REPLACE FUNCTION public.auto_cancel_abandoned_orders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  FOR v_order IN SELECT id FROM public.orders WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes'
  LOOP
    FOR v_item IN SELECT oi.product_id, oi.quantity FROM public.order_items oi JOIN public.vendor_orders vo ON oi.vendor_order_id = vo.id WHERE vo.order_id = v_order.id
    LOOP
      UPDATE public.products SET stock_quantity = stock_quantity + v_item.quantity WHERE id = v_item.product_id;
    END LOOP;
    UPDATE public.vendor_orders SET status = 'cancelled'::public.order_status WHERE order_id = v_order.id;
    UPDATE public.orders SET status = 'cancelled'::public.order_status WHERE id = v_order.id;
  END LOOP;
END;
$$;
SELECT cron.schedule('auto-cancel-abandoned-orders', '*/15 * * * *', $$SELECT public.auto_cancel_abandoned_orders();$$);
