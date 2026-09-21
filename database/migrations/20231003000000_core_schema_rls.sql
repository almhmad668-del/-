-- 1. Enable RLS on all tables
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- 2. Helper Function: is_vendor_owner
-- Checks if the authenticated user is the owner of the given vendor_id
CREATE OR REPLACE FUNCTION public.is_vendor_owner(check_vendor_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.vendors
    WHERE id = check_vendor_id AND user_id = auth.uid()
  );
$$;

-- 3. Define RLS Policies

-- Vendors Table
CREATE POLICY "Public can view vendors" ON public.vendors
  FOR SELECT
  USING (true);

CREATE POLICY "Vendor owners can update own vendor" ON public.vendors
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Products Table
CREATE POLICY "Public can view products" ON public.products
  FOR SELECT
  USING (true);

CREATE POLICY "Vendor owners can insert products" ON public.products
  FOR INSERT
  WITH CHECK (public.is_vendor_owner(vendor_id));

CREATE POLICY "Vendor owners can update products" ON public.products
  FOR UPDATE
  USING (public.is_vendor_owner(vendor_id))
  WITH CHECK (public.is_vendor_owner(vendor_id));

CREATE POLICY "Vendor owners can delete products" ON public.products
  FOR DELETE
  USING (public.is_vendor_owner(vendor_id));

-- Orders Table (Main customer order)
CREATE POLICY "Customers can view their own orders" ON public.orders
  FOR SELECT
  USING (customer_id = auth.uid());

-- Vendor Orders Table (Sub-orders)
CREATE POLICY "Customers and vendor owners can view vendor orders" ON public.vendor_orders
  FOR SELECT
  USING (
    public.is_vendor_owner(vendor_id) OR
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
  );

-- Order Items Table
CREATE POLICY "Customers and vendor owners can view order items" ON public.order_items
  FOR SELECT
  USING (
    vendor_order_id IN (
      SELECT id FROM public.vendor_orders WHERE public.is_vendor_owner(vendor_id)
    ) OR
    vendor_order_id IN (
      SELECT vo.id FROM public.vendor_orders vo
      JOIN public.orders o ON vo.order_id = o.id
      WHERE o.customer_id = auth.uid()
    )
  );

-- Ledger Entries Table
CREATE POLICY "Vendor owners can view their ledger entries" ON public.ledger_entries
  FOR SELECT
  USING (public.is_vendor_owner(vendor_id));

-- Processed Webhooks
-- Intentionally left blank. By enabling RLS without adding public policies,
-- only the service_role key (e.g. from Edge Functions) will be able to read/write.
