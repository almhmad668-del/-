-- ==============================================================================
-- 🏗️ PHASE 10: STRIPE CHECKOUT SESSIONS & PAYMENT ARCHITECTURE
-- ==============================================================================

-- 1. PAYMENTS TABLE
-- We create a specific payments table separate from the order so we can track multiple attempts.
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_id TEXT, -- e.g., the Stripe Payment Intent ID once generated
  provider_checkout_session_id TEXT, -- The Stripe Checkout Session ID
  status public.payment_status NOT NULL DEFAULT 'pending',
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order_id ON public.payments(order_id);
CREATE UNIQUE INDEX idx_payments_checkout_session ON public.payments(provider_checkout_session_id);

CREATE TRIGGER set_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE PROCEDURE public.set_current_timestamp_updated_at();

-- 2. STRIPE WEBHOOK EVENTS TABLE (IDEMPOTENCY)
-- This enforces exactly-once webhook processing via database UNIQUE constraints.
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. INVENTORY RESTORATION RPC
-- Critical function to restore inventory when a checkout session expires.
-- We must make this entirely atomic to prevent double-restoring or race conditions against successful payments.
CREATE OR REPLACE FUNCTION public.handle_expired_checkout(p_checkout_session_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment RECORD;
  v_item RECORD;
  v_order_status public.order_status;
BEGIN
  -- 1. Find the pending payment for this session
  SELECT * INTO v_payment FROM public.payments WHERE provider_checkout_session_id = p_checkout_session_id FOR UPDATE;

  -- If not found, or already successfully processed (paid/refunded), do not restore inventory.
  IF NOT FOUND OR v_payment.status IN ('paid', 'refunded', 'failed', 'cancelled') THEN
    RETURN;
  END IF;

  -- Verify the order hasn't transitioned out of pending (safety net)
  SELECT status INTO v_order_status FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;
  IF v_order_status != 'pending' THEN
    RETURN;
  END IF;

  -- 2. Mark the payment as failed (since it expired)
  UPDATE public.payments SET status = 'failed' WHERE id = v_payment.id;

  -- 3. Mark the master order and vendor orders as cancelled
  UPDATE public.orders SET status = 'cancelled' WHERE id = v_payment.order_id;
  UPDATE public.vendor_orders SET status = 'cancelled' WHERE order_id = v_payment.order_id;

  -- 4. Restore the inventory identically to how it was reduced
  FOR v_item IN
    SELECT oi.product_id, oi.variant_id, oi.quantity
    FROM public.order_items oi
    JOIN public.vendor_orders vo ON oi.vendor_order_id = vo.id
    WHERE vo.order_id = v_payment.order_id
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE public.product_variants SET stock_quantity = stock_quantity + v_item.quantity WHERE id = v_item.variant_id;
    ELSE
      UPDATE public.products SET stock_quantity = stock_quantity + v_item.quantity WHERE id = v_item.product_id;
    END IF;
  END LOOP;
END;
$$;


-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Customers can view payments attached to their own orders
CREATE POLICY "Buyers can view their own payments" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );

-- Admins can view everything
CREATE POLICY "Admins have full access payments" ON public.payments
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));

-- Webhook table doesn't need public access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins have full access webhooks" ON public.stripe_webhook_events
  FOR ALL USING (public.is_admin_or_super_admin(auth.uid()));
