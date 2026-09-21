-- ==============================================================================
-- 🗂️ Task 5.1: Storage Buckets & Strict RLS Policies
-- ==============================================================================

-- Create buckets in storage schema (Supabase internal schema)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('products', 'products', true),
  ('avatars', 'avatars', true),
  ('vendor_logos', 'vendor_logos', true)
ON CONFLICT (id) DO NOTHING;

-- Note: RLS is typically already enabled on storage.objects in Supabase.
-- We are adding the specific policies here.

-- 1. Read: Public can read all three buckets.
CREATE POLICY "Public Read Access" ON storage.objects
  FOR SELECT
  USING (bucket_id IN ('products', 'avatars', 'vendor_logos'));

-- 2. Insert/Update/Delete for Avatars (Users only upload to their uid folder)
CREATE POLICY "Users can upload their own avatars" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatars" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatars" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- 3. Insert/Update/Delete for Products and Vendor Logos (Vendors only)
-- We check if the user is a vendor by looking for a record in the public.vendors table where user_id matches auth.uid()
CREATE POLICY "Vendors can upload product images and logos" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id IN ('products', 'vendor_logos') AND
    auth.uid()::text = (storage.foldername(name))[1] AND
    EXISTS (SELECT 1 FROM public.vendors WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendors can update product images and logos" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id IN ('products', 'vendor_logos') AND
    auth.uid()::text = (storage.foldername(name))[1] AND
    EXISTS (SELECT 1 FROM public.vendors WHERE user_id = auth.uid())
  );

CREATE POLICY "Vendors can delete product images and logos" ON storage.objects
  FOR DELETE
  USING (
    bucket_id IN ('products', 'vendor_logos') AND
    auth.uid()::text = (storage.foldername(name))[1] AND
    EXISTS (SELECT 1 FROM public.vendors WHERE user_id = auth.uid())
  );


-- ==============================================================================
-- ⏳ Task 5.2: Automated Inventory Restock (pg_cron)
-- ==============================================================================

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the auto cancel function
CREATE OR REPLACE FUNCTION public.auto_cancel_abandoned_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  -- Find abandoned orders
  FOR v_order IN
    SELECT id
    FROM public.orders
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '30 minutes'
  LOOP
    -- 1. Restore stock quantity for items in this order
    FOR v_item IN
      SELECT oi.product_id, oi.quantity
      FROM public.order_items oi
      JOIN public.vendor_orders vo ON oi.vendor_order_id = vo.id
      WHERE vo.order_id = v_order.id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.product_id;
    END LOOP;

    -- 2. Update Vendor Sub-orders status
    UPDATE public.vendor_orders
    SET status = 'cancelled'::public.order_status
    WHERE order_id = v_order.id;

    -- 3. Update Main Order status
    UPDATE public.orders
    SET status = 'cancelled'::public.order_status
    WHERE id = v_order.id;

  END LOOP;
END;
$$;

-- Schedule the cron job to run every 15 minutes
SELECT cron.schedule(
  'auto-cancel-abandoned-orders',
  '*/15 * * * *',
  $$SELECT public.auto_cancel_abandoned_orders();$$
);


-- ==============================================================================
-- ⚡ Task 5.3: High-Performance View for the Main Feed
-- ==============================================================================

-- We use a standard VIEW here to ensure data is always fresh without needing complex refresh logic.
-- If the dataset grows to millions, a MATERIALIZED VIEW with a pg_cron refresh trigger might be better,
-- but a standard VIEW with proper indexing on stock_quantity will be blazing fast.
CREATE OR REPLACE VIEW public.marketplace_feed_view AS
SELECT
  p.id AS product_id,
  p.title,
  p.price,
  p.is_cod_enabled,
  p.stock_quantity,
  v.store_name
FROM
  public.products p
JOIN
  public.vendors v ON p.vendor_id = v.id
WHERE
  p.stock_quantity > 0;

-- Ensure an index exists on stock_quantity to make this view extremely fast
CREATE INDEX IF NOT EXISTS idx_products_stock_quantity ON public.products(stock_quantity);
