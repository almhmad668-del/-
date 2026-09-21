-- 1. Create the RPC for marketplace checkout
CREATE OR REPLACE FUNCTION public.process_marketplace_checkout(order_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;

  -- Variables for loops and processing
  v_item JSONB;
  v_product_id UUID;
  v_req_quantity INT;

  v_product RECORD;
  v_vendor RECORD;

  -- Tracking totals
  v_grand_total NUMERIC := 0;
  v_main_order_id UUID;

  -- Vendor grouping variables
  v_vendor_id UUID;
  v_vendor_subtotal NUMERIC;
  v_vendor_commission NUMERIC;
  v_vendor_order_id UUID;

  -- A temporary table to hold processed item data so we can group it by vendor later
  -- This avoids needing complex JSON path queries or multiple passes over the DB
BEGIN
  -- Extract customer ID securely from the authenticated session
  v_customer_id := auth.uid();

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User must be logged in to checkout';
  END IF;

  -- Validate payload customer_id matches authenticated user to prevent IDOR if passed
  IF order_payload->>'customer_id' IS NOT NULL AND (order_payload->>'customer_id')::UUID != v_customer_id THEN
     RAISE EXCEPTION 'Unauthorized: Cannot checkout for another user';
  END IF;

  -- Create a temporary table to store the enriched cart items for this transaction
  -- Use IF NOT EXISTS and ON COMMIT DELETE ROWS to avoid PL/pgSQL caching bugs with OIDs
  CREATE TEMP TABLE IF NOT EXISTS temp_cart_items (
    product_id UUID,
    vendor_id UUID,
    quantity INT,
    price NUMERIC,
    line_total NUMERIC
  ) ON COMMIT DELETE ROWS;

  -- Step A: Lock & Deduct Inventory
  -- We loop through the items ordered by product_id to prevent deadlocks
  FOR v_item IN
    SELECT * FROM jsonb_array_elements(order_payload->'items')
    ORDER BY (value->>'product_id')::UUID
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_req_quantity := (v_item->>'quantity')::INT;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'Product ID is missing in payload item';
    END IF;

    IF v_req_quantity IS NULL OR v_req_quantity <= 0 THEN
      RAISE EXCEPTION 'Quantity for product % must be greater than 0', v_product_id;
    END IF;

    -- Pessimistic Lock on the product row
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % does not exist', v_product_id;
    END IF;

    IF v_product.stock_quantity < v_req_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (Requested: %, Available: %)', v_product.title, v_req_quantity, v_product.stock_quantity;
    END IF;

    -- Deduct stock
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_req_quantity
    WHERE id = v_product_id;

    -- Save to temp table for Step C & D
    INSERT INTO temp_cart_items (product_id, vendor_id, quantity, price, line_total)
    VALUES (v_product_id, v_product.vendor_id, v_req_quantity, v_product.price, v_product.price * v_req_quantity);

    -- Accumulate grand total
    v_grand_total := v_grand_total + (v_product.price * v_req_quantity);

  END LOOP;

  -- Step B: Create Main Order
  INSERT INTO public.orders (customer_id, total_amount, status)
  VALUES (v_customer_id, v_grand_total, 'pending')
  RETURNING id INTO v_main_order_id;

  -- Step C: Split Sub-Orders & Freeze Commissions
  -- Loop through unique vendors involved in this checkout
  FOR v_vendor_id IN SELECT DISTINCT vendor_id FROM temp_cart_items
  LOOP
    -- Fetch vendor's commission rate
    SELECT * INTO v_vendor FROM public.vendors WHERE id = v_vendor_id;

    -- Calculate this vendor's subtotal for the order
    SELECT COALESCE(SUM(line_total), 0) INTO v_vendor_subtotal
    FROM temp_cart_items
    WHERE vendor_id = v_vendor_id;

    -- Calculate commission amount based on the rate snapshot
    v_vendor_commission := v_vendor_subtotal * (v_vendor.default_commission_rate / 100.0);

    -- Create Vendor Order (Sub-order)
    INSERT INTO public.vendor_orders (
      order_id,
      vendor_id,
      commission_rate_snapshot,
      subtotal_amount,
      commission_amount,
      status
    )
    VALUES (
      v_main_order_id,
      v_vendor_id,
      v_vendor.default_commission_rate,
      v_vendor_subtotal,
      v_vendor_commission,
      'pending'
    )
    RETURNING id INTO v_vendor_order_id;

    -- Step D: Insert Order Items for this vendor order
    INSERT INTO public.order_items (vendor_order_id, product_id, quantity, price_at_purchase)
    SELECT v_vendor_order_id, product_id, quantity, price
    FROM temp_cart_items
    WHERE vendor_id = v_vendor_id;

    -- Step E: Pending Financial Ledger Entries
    -- Insert a credit for the vendor's net earnings (subtotal - commission)
    INSERT INTO public.ledger_entries (vendor_id, type, amount, reference_id)
    VALUES (
      v_vendor_id,
      'credit',
      v_vendor_subtotal - v_vendor_commission,
      v_vendor_order_id
    );

  END LOOP;

  -- Return the master order ID
  RETURN v_main_order_id;

END;
$$;
